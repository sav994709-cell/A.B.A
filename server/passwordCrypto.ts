import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export type PasswordHashAlgorithm = 'scrypt' | 'bcrypt';

export interface PasswordCryptoConfig {
  algorithm: PasswordHashAlgorithm;
  scryptN: number;
  scryptR: number;
  scryptP: number;
  scryptKeylen: number;
  bcryptRounds: number;
}

const SALT_BYTES = 16;
const BCRYPT_REGEX = /^\$2[aby]\$(\d{2})\$.{53}$/;
const MD5_HEX_REGEX = /^[a-f0-9]{32}$/i;
const SHA1_HEX_REGEX = /^[a-f0-9]{40}$/i;
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i;

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1024 && (n & (n - 1)) === 0;
}

function parseIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function getPasswordCryptoConfig(): PasswordCryptoConfig {
  const rawAlgo = (process.env.PASSWORD_HASH_ALGORITHM ?? 'scrypt').trim().toLowerCase();
  const algorithm: PasswordHashAlgorithm = rawAlgo === 'bcrypt' ? 'bcrypt' : 'scrypt';

  const rawN = parseIntEnv('PASSWORD_SCRYPT_N', 16384, 1024, 1048576);
  const scryptN = isPowerOfTwo(rawN) ? rawN : 16384;
  const scryptR = parseIntEnv('PASSWORD_SCRYPT_R', 8, 1, 64);
  const scryptP = parseIntEnv('PASSWORD_SCRYPT_P', 1, 1, 16);
  const scryptKeylen = parseIntEnv('PASSWORD_SCRYPT_KEYLEN', 64, 32, 128);
  const bcryptRounds = parseIntEnv('PASSWORD_BCRYPT_ROUNDS', 12, 10, 15);

  return {
    algorithm,
    scryptN,
    scryptR,
    scryptP,
    scryptKeylen,
    bcryptRounds,
  };
}

function computeScryptMaxMem(n: number, r: number, p: number): number {
  // scrypt requiere ~128 * N * r * p bytes; dejamos margen para evitar fallos si se sube el costo por configuración
  return Math.max(32 * 1024 * 1024, 256 * n * r * p);
}

function deriveScrypt(
  secret: string,
  salt: Buffer,
  params: { n: number; r: number; p: number; keylen: number }
): Buffer {
  return crypto.scryptSync(secret, salt, params.keylen, {
    N: params.n,
    r: params.r,
    p: params.p,
    maxmem: computeScryptMaxMem(params.n, params.r, params.p),
  });
}

function formatScryptString(
  prefix: 'scrypt' | 'scrypt-legacy-md5' | 'scrypt-legacy-sha1' | 'scrypt-legacy-sha256',
  params: { n: number; r: number; p: number },
  salt: Buffer,
  derived: Buffer
): string {
  return `$${prefix}$N=${params.n},r=${params.r},p=${params.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

interface ParsedScryptRecord {
  kind: 'scrypt' | 'scrypt-legacy-md5' | 'scrypt-legacy-sha1' | 'scrypt-legacy-sha256';
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parseScryptString(stored: string): ParsedScryptRecord | null {
  if (!stored.startsWith('$')) return null;
  const parts = stored.split('$');
  // Esperado: ['', prefix, 'N=...,r=...,p=...', saltB64, hashB64]
  if (parts.length !== 5) return null;

  const kind = parts[1];
  if (
    kind !== 'scrypt' &&
    kind !== 'scrypt-legacy-md5' &&
    kind !== 'scrypt-legacy-sha1' &&
    kind !== 'scrypt-legacy-sha256'
  ) {
    return null;
  }

  const paramMatch = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[2]);
  if (!paramMatch) return null;

  const n = Number(paramMatch[1]);
  const r = Number(paramMatch[2]);
  const p = Number(paramMatch[3]);
  if (!isPowerOfTwo(n) || !Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) {
    return null;
  }

  try {
    const salt = Buffer.from(parts[3], 'base64url');
    const hash = Buffer.from(parts[4], 'base64url');
    if (salt.length < 8 || hash.length < 16) return null;
    return { kind, n, r, p, salt, hash };
  } catch {
    return null;
  }
}

export function hashPassword(plainPassword: string): string {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('La contraseña no puede estar vacía.');
  }

  const cfg = getPasswordCryptoConfig();
  if (cfg.algorithm === 'bcrypt') {
    return bcrypt.hashSync(plainPassword, cfg.bcryptRounds);
  }

  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = deriveScrypt(plainPassword, salt, {
    n: cfg.scryptN,
    r: cfg.scryptR,
    p: cfg.scryptP,
    keylen: cfg.scryptKeylen,
  });

  return formatScryptString(
    'scrypt',
    { n: cfg.scryptN, r: cfg.scryptR, p: cfg.scryptP },
    salt,
    derived
  );
}

export interface PasswordVerifyResult {
  valid: boolean;
  needsUpgrade: boolean;
  upgradedHash?: string;
  legacyType?: 'bcrypt' | 'scrypt_reconfig' | 'md5' | 'sha1' | 'sha256' | 'plaintext';
}

function timingSafeCompareBuffers(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPassword(plainPassword: string, storedHash: string): PasswordVerifyResult {
  if (typeof plainPassword !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return { valid: false, needsUpgrade: false };
  }

  const cfg = getPasswordCryptoConfig();

  // 1. Formato moderno scrypt o envoltorio de migración scrypt-legacy-*
  const parsedScrypt = parseScryptString(storedHash);
  if (parsedScrypt) {
    let secretToVerify = plainPassword;
    let legacyAlg: 'md5' | 'sha1' | 'sha256' | null = null;

    if (parsedScrypt.kind === 'scrypt-legacy-md5') {
      legacyAlg = 'md5';
      secretToVerify = crypto.createHash('md5').update(plainPassword, 'utf8').digest('hex');
    } else if (parsedScrypt.kind === 'scrypt-legacy-sha1') {
      legacyAlg = 'sha1';
      secretToVerify = crypto.createHash('sha1').update(plainPassword, 'utf8').digest('hex');
    } else if (parsedScrypt.kind === 'scrypt-legacy-sha256') {
      legacyAlg = 'sha256';
      secretToVerify = crypto.createHash('sha256').update(plainPassword, 'utf8').digest('hex');
    }

    const derived = deriveScrypt(secretToVerify, parsedScrypt.salt, {
      n: parsedScrypt.n,
      r: parsedScrypt.r,
      p: parsedScrypt.p,
      keylen: parsedScrypt.hash.length,
    });

    const valid = timingSafeCompareBuffers(derived, parsedScrypt.hash);
    if (!valid) {
      return { valid: false, needsUpgrade: false };
    }

    const needsReconfig =
      cfg.algorithm !== 'scrypt' ||
      parsedScrypt.n < cfg.scryptN ||
      parsedScrypt.r < cfg.scryptR ||
      parsedScrypt.p < cfg.scryptP ||
      parsedScrypt.hash.length < cfg.scryptKeylen;

    if (legacyAlg !== null || needsReconfig) {
      return {
        valid: true,
        needsUpgrade: true,
        upgradedHash: hashPassword(plainPassword),
        legacyType: legacyAlg ?? 'scrypt_reconfig',
      };
    }

    return { valid: true, needsUpgrade: false };
  }

  // 2. Hashes bcrypt ($2a$, $2b$, $2y$)
  const bcryptMatch = BCRYPT_REGEX.exec(storedHash);
  if (bcryptMatch) {
    const normalizedHash = storedHash.startsWith('$2y$')
      ? '$2a$' + storedHash.slice(4)
      : storedHash;
    const valid = bcrypt.compareSync(plainPassword, normalizedHash);
    if (!valid) {
      return { valid: false, needsUpgrade: false };
    }

    const rounds = Number(bcryptMatch[1]);
    const needsUpgrade = cfg.algorithm !== 'bcrypt' || rounds < cfg.bcryptRounds;
    return {
      valid: true,
      needsUpgrade,
      upgradedHash: needsUpgrade ? hashPassword(plainPassword) : undefined,
      legacyType: needsUpgrade ? 'bcrypt' : undefined,
    };
  }

  // 3. Hashes débiles sin envolver (MD5, SHA-1, SHA-256)
  if (MD5_HEX_REGEX.test(storedHash)) {
    const digest = crypto.createHash('md5').update(plainPassword, 'utf8').digest('hex');
    const valid = timingSafeCompareStrings(digest, storedHash.toLowerCase());
    return valid
      ? { valid: true, needsUpgrade: true, upgradedHash: hashPassword(plainPassword), legacyType: 'md5' }
      : { valid: false, needsUpgrade: false };
  }

  if (SHA1_HEX_REGEX.test(storedHash)) {
    const digest = crypto.createHash('sha1').update(plainPassword, 'utf8').digest('hex');
    const valid = timingSafeCompareStrings(digest, storedHash.toLowerCase());
    return valid
      ? { valid: true, needsUpgrade: true, upgradedHash: hashPassword(plainPassword), legacyType: 'sha1' }
      : { valid: false, needsUpgrade: false };
  }

  if (SHA256_HEX_REGEX.test(storedHash)) {
    const digest = crypto.createHash('sha256').update(plainPassword, 'utf8').digest('hex');
    const valid = timingSafeCompareStrings(digest, storedHash.toLowerCase());
    return valid
      ? {
          valid: true,
          needsUpgrade: true,
          upgradedHash: hashPassword(plainPassword),
          legacyType: 'sha256',
        }
      : { valid: false, needsUpgrade: false };
  }

  // 4. Respaldo para texto plano legado no migrado todavía (comparación en tiempo constante)
  const valid = timingSafeCompareStrings(plainPassword, storedHash);
  return valid
    ? {
        valid: true,
        needsUpgrade: true,
        upgradedHash: hashPassword(plainPassword),
        legacyType: 'plaintext',
      }
    : { valid: false, needsUpgrade: false };
}

let cachedDummyHash: { signature: string; hash: string } | null = null;

/**
 * Ejecuta una verificación en tiempo constante equivalente a una verificación real
 * para evitar enumeración de usuarios mediante diferencias de tiempo.
 */
export function verifyDummyPassword(plainPassword: string): void {
  const cfg = getPasswordCryptoConfig();
  const signature = `${cfg.algorithm}:${cfg.scryptN}:${cfg.scryptR}:${cfg.scryptP}:${cfg.scryptKeylen}:${cfg.bcryptRounds}`;
  if (!cachedDummyHash || cachedDummyHash.signature !== signature) {
    cachedDummyHash = {
      signature,
      hash: hashPassword('aba-constant-time-dummy-secret'),
    };
  }
  verifyPassword(plainPassword || 'dummy', cachedDummyHash.hash);
}

/**
 * Convierte contraseñas en texto plano o hashes débiles (MD5/SHA-1/SHA-256)
 * almacenados en la base de datos a un formato protegido en reposo sin romper el acceso.
 */
export function migrateLegacyHashValue(storedValue: string): {
  migrated: boolean;
  reason?: 'plaintext_hashed' | 'weak_hash_wrapped';
  value: string;
} {
  if (!storedValue) {
    return { migrated: false, value: storedValue };
  }

  if (parseScryptString(storedValue) !== null || BCRYPT_REGEX.test(storedValue)) {
    return { migrated: false, value: storedValue };
  }

  const cfg = getPasswordCryptoConfig();

  const wrapWeakHex = (
    prefix: 'scrypt-legacy-md5' | 'scrypt-legacy-sha1' | 'scrypt-legacy-sha256',
    hexDigest: string
  ): string => {
    const salt = crypto.randomBytes(SALT_BYTES);
    const derived = deriveScrypt(hexDigest.toLowerCase(), salt, {
      n: cfg.scryptN,
      r: cfg.scryptR,
      p: cfg.scryptP,
      keylen: cfg.scryptKeylen,
    });
    return formatScryptString(
      prefix,
      { n: cfg.scryptN, r: cfg.scryptR, p: cfg.scryptP },
      salt,
      derived
    );
  };

  if (MD5_HEX_REGEX.test(storedValue)) {
    return {
      migrated: true,
      reason: 'weak_hash_wrapped',
      value: wrapWeakHex('scrypt-legacy-md5', storedValue),
    };
  }

  if (SHA1_HEX_REGEX.test(storedValue)) {
    return {
      migrated: true,
      reason: 'weak_hash_wrapped',
      value: wrapWeakHex('scrypt-legacy-sha1', storedValue),
    };
  }

  if (SHA256_HEX_REGEX.test(storedValue)) {
    return {
      migrated: true,
      reason: 'weak_hash_wrapped',
      value: wrapWeakHex('scrypt-legacy-sha256', storedValue),
    };
  }

  // Texto plano legado: se reemplaza inmediatamente por hash scrypt con sal aleatoria
  return {
    migrated: true,
    reason: 'plaintext_hashed',
    value: hashPassword(storedValue),
  };
}

function loadAes256Key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim() ?? '';
  if (!raw) {
    throw new Error(
      'Falta configurar DATA_ENCRYPTION_KEY en el entorno para cifrado reversible AES-256-GCM.'
    );
  }
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) {
    return b64;
  }
  throw new Error('DATA_ENCRYPTION_KEY debe representar exactamente 32 bytes (256 bits).');
}

/**
 * Cifrado simétrico autenticado (AES-256-GCM) reservado exclusivamente para datos personales
 * sensibles que el sistema necesite recuperar (nunca para contraseñas de acceso).
 */
export function encryptSensitiveData(plaintext: string): string {
  const key = loadAes256Key();
  const iv = crypto.randomBytes(12); // Nonce recomendado de 96 bits para GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSensitiveData(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Formato de dato cifrado inválido.');
  }
  const key = loadAes256Key();
  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const ciphertext = Buffer.from(parts[4], 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
