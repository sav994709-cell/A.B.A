import type { Request } from 'express';
import { db } from './db.ts';

export const MAX_ACCOUNT_IP_ATTEMPTS = 5;
export const MAX_ACCOUNT_GLOBAL_ATTEMPTS = 10;
export const MAX_IP_ATTEMPTS = 15;
export const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutos
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // Ventana de conteo de intentos

export type LockoutScope = 'account_ip' | 'account' | 'ip';

let customNowFn: (() => number) | null = null;

function nowMs(): number {
  if (process.env.NODE_ENV === 'test' && customNowFn) {
    return customNowFn();
  }
  return Date.now();
}

export function setLoginGuardClockForTest(fn: (() => number) | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setLoginGuardClockForTest solo está permitido en entorno de pruebas.');
  }
  customNowFn = fn;
}

export function extractClientIp(req: Request): string {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function maskEmailForAudit(email: string): string {
  const clean = email.trim().toLowerCase();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '***';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function formatWaitDuration(remainingMs: number): string {
  const totalSec = Math.max(1, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins > 0 && secs > 0) {
    return `${mins} min ${secs} s`;
  }
  if (mins > 0) {
    return `${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
  }
  return `${secs} s`;
}

export function buildLockoutErrorMessage(remainingMs: number): string {
  return `Has alcanzado el límite de intentos fallidos de inicio de sesión. Por seguridad, espera ${formatWaitDuration(remainingMs)} antes de volver a intentarlo.`;
}

function logAuthAudit(params: {
  tipoEvento: 'LOGIN_LOCKED' | 'LOGIN_BLOCKED_ATTEMPT' | 'LOGIN_FAILED' | 'LOGIN_SUCCESS_RESET';
  scope?: LockoutScope | null;
  email?: string;
  ip: string;
  intentos?: number;
  bloqueadoHastaMs?: number | null;
  detalle?: string;
  timestampMs: number;
}): void {
  const maskedEmail = params.email ? maskEmailForAudit(params.email) : null;
  db.prepare(
    `INSERT INTO auth_audit_log
     (tipo_evento, scope, email_enmascarado, ip_origen, intentos, bloqueado_hasta_ms, detalle, creado_en_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.tipoEvento,
    params.scope ?? null,
    maskedEmail,
    params.ip,
    params.intentos ?? 0,
    params.bloqueadoHastaMs ?? null,
    params.detalle ?? null,
    params.timestampMs
  );

  if (params.tipoEvento === 'LOGIN_LOCKED' || params.tipoEvento === 'LOGIN_BLOCKED_ATTEMPT') {
    console.warn(
      JSON.stringify({
        event: params.tipoEvento,
        scope: params.scope ?? null,
        account: maskedEmail,
        ip: params.ip,
        intentos: params.intentos ?? 0,
        bloqueado_hasta_ms: params.bloqueadoHastaMs ?? null,
        timestamp_ms: params.timestampMs,
      })
    );
  }
}

function buildScopeKeys(email: string, ip: string): Array<{
  scope: LockoutScope;
  clave: string;
  maxAttempts: number;
}> {
  const normalizedEmail = email.trim().toLowerCase();
  return [
    { scope: 'account_ip', clave: `${normalizedEmail}|${ip}`, maxAttempts: MAX_ACCOUNT_IP_ATTEMPTS },
    { scope: 'account', clave: normalizedEmail, maxAttempts: MAX_ACCOUNT_GLOBAL_ATTEMPTS },
    { scope: 'ip', clave: ip, maxAttempts: MAX_IP_ATTEMPTS },
  ];
}

export interface LockoutCheckResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remainingMs: number;
  error?: string;
}

export function checkLoginAllowed(email: string, ip: string): LockoutCheckResult {
  const now = nowMs();
  const keys = buildScopeKeys(email, ip);

  let activeBlockUntil: number | null = null;
  let activeScope: LockoutScope | null = null;
  let activeAttempts = 0;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const selectStmt = db.prepare(
      'SELECT intentos_fallidos, ultimo_intento_ms, bloqueado_hasta_ms FROM login_bloqueo WHERE scope = ? AND clave = ?'
    );
    const deleteStmt = db.prepare('DELETE FROM login_bloqueo WHERE scope = ? AND clave = ?');

    for (const item of keys) {
      const row = selectStmt.get(item.scope, item.clave) as
        | { intentos_fallidos: number; ultimo_intento_ms: number; bloqueado_hasta_ms: number | null }
        | undefined;

      if (!row) continue;

      // Expiración automática tras cumplirse los 5 minutos o tras vencer la ventana de intentos
      if (row.bloqueado_hasta_ms !== null && Number(row.bloqueado_hasta_ms) <= now) {
        deleteStmt.run(item.scope, item.clave);
        continue;
      }

      if (row.bloqueado_hasta_ms === null && now - Number(row.ultimo_intento_ms) > ATTEMPT_WINDOW_MS) {
        deleteStmt.run(item.scope, item.clave);
        continue;
      }

      if (row.bloqueado_hasta_ms !== null && Number(row.bloqueado_hasta_ms) > now) {
        const until = Number(row.bloqueado_hasta_ms);
        if (activeBlockUntil === null || until > activeBlockUntil) {
          activeBlockUntil = until;
          activeScope = item.scope;
          activeAttempts = Number(row.intentos_fallidos);
        }
      }
    }

    if (activeBlockUntil !== null) {
      logAuthAudit({
        tipoEvento: 'LOGIN_BLOCKED_ATTEMPT',
        scope: activeScope,
        email,
        ip,
        intentos: activeAttempts,
        bloqueadoHastaMs: activeBlockUntil,
        detalle: 'Intento rechazado durante periodo de bloqueo activo.',
        timestampMs: now,
      });
    }

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }

  if (activeBlockUntil !== null) {
    const remainingMs = Math.max(1, activeBlockUntil - now);
    return {
      allowed: false,
      remainingMs,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      error: buildLockoutErrorMessage(remainingMs),
    };
  }

  return { allowed: true, remainingMs: 0, retryAfterSeconds: 0 };
}

export function recordFailedLoginAttempt(email: string, ip: string): {
  lockedNow: boolean;
  remainingMs: number;
  retryAfterSeconds: number;
  error?: string;
} {
  const now = nowMs();
  const keys = buildScopeKeys(email, ip);

  let lockedUntilMax: number | null = null;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const selectStmt = db.prepare(
      'SELECT intentos_fallidos, primer_intento_ms, ultimo_intento_ms, bloqueado_hasta_ms FROM login_bloqueo WHERE scope = ? AND clave = ?'
    );
    const upsertStmt = db.prepare(
      `INSERT INTO login_bloqueo (scope, clave, intentos_fallidos, primer_intento_ms, ultimo_intento_ms, bloqueado_hasta_ms)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (scope, clave) DO UPDATE SET
         intentos_fallidos = excluded.intentos_fallidos,
         primer_intento_ms = excluded.primer_intento_ms,
         ultimo_intento_ms = excluded.ultimo_intento_ms,
         bloqueado_hasta_ms = excluded.bloqueado_hasta_ms`
    );

    for (const item of keys) {
      const existing = selectStmt.get(item.scope, item.clave) as
        | {
            intentos_fallidos: number;
            primer_intento_ms: number;
            ultimo_intento_ms: number;
            bloqueado_hasta_ms: number | null;
          }
        | undefined;

      const isExpiredLock =
        existing?.bloqueado_hasta_ms !== null &&
        existing?.bloqueado_hasta_ms !== undefined &&
        Number(existing.bloqueado_hasta_ms) <= now;
      const isStaleWindow =
        existing !== undefined &&
        existing.bloqueado_hasta_ms === null &&
        now - Number(existing.ultimo_intento_ms) > ATTEMPT_WINDOW_MS;

      const nextAttempts =
        !existing || isExpiredLock || isStaleWindow ? 1 : Number(existing.intentos_fallidos) + 1;
      const firstAttemptMs =
        !existing || isExpiredLock || isStaleWindow ? now : Number(existing.primer_intento_ms);

      const shouldLock = nextAttempts >= item.maxAttempts;
      const lockUntil = shouldLock ? now + LOCKOUT_DURATION_MS : null;

      upsertStmt.run(item.scope, item.clave, nextAttempts, firstAttemptMs, now, lockUntil);

      if (shouldLock && lockUntil !== null) {
        if (lockedUntilMax === null || lockUntil > lockedUntilMax) {
          lockedUntilMax = lockUntil;
        }
        logAuthAudit({
          tipoEvento: 'LOGIN_LOCKED',
          scope: item.scope,
          email,
          ip,
          intentos: nextAttempts,
          bloqueadoHastaMs: lockUntil,
          detalle: `Bloqueo temporal activado por ${nextAttempts} intentos fallidos.`,
          timestampMs: now,
        });
      }
    }

    if (lockedUntilMax === null) {
      logAuthAudit({
        tipoEvento: 'LOGIN_FAILED',
        scope: 'account_ip',
        email,
        ip,
        detalle: 'Intento de inicio de sesión fallido.',
        timestampMs: now,
      });
    }

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }

  if (lockedUntilMax !== null) {
    const remainingMs = Math.max(1, lockedUntilMax - now);
    return {
      lockedNow: true,
      remainingMs,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      error: buildLockoutErrorMessage(remainingMs),
    };
  }

  return { lockedNow: false, remainingMs: 0, retryAfterSeconds: 0 };
}

export function resetLoginAttemptsOnSuccess(email: string, ip: string): void {
  const now = nowMs();
  const normalizedEmail = email.trim().toLowerCase();

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const deleteStmt = db.prepare('DELETE FROM login_bloqueo WHERE scope = ? AND clave = ?');
    deleteStmt.run('account_ip', `${normalizedEmail}|${ip}`);
    deleteStmt.run('account', normalizedEmail);
    // Solo limpiar el contador de IP si la IP no estaba bloqueada por ataques masivos
    db.prepare(
      'DELETE FROM login_bloqueo WHERE scope = ? AND clave = ? AND (bloqueado_hasta_ms IS NULL OR bloqueado_hasta_ms <= ?)'
    ).run('ip', ip, now);

    logAuthAudit({
      tipoEvento: 'LOGIN_SUCCESS_RESET',
      email,
      ip,
      detalle: 'Contadores de intentos fallidos restablecidos tras inicio de sesión exitoso.',
      timestampMs: now,
    });

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }
}

export function listAuthAuditEvents(limit = 50) {
  return db
    .prepare(
      `SELECT id_evento, tipo_evento, scope, email_enmascarado, ip_origen,
              intentos, bloqueado_hasta_ms, detalle, creado_en_ms
       FROM auth_audit_log
       ORDER BY id_evento DESC
       LIMIT ?`
    )
    .all(limit);
}
