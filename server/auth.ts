import crypto from 'node:crypto';
import type { Request, Response, NextFunction, CookieOptions } from 'express';
import { db } from './db.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || 'aba-active-pedagogy-secret-2026';
export const SESSION_COOKIE_NAME = 'aba_session';
export const REFRESH_COOKIE_NAME = 'aba_refresh';

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutos
export const TEMPORARY_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas máx. para sesión temporal
export const PERSISTENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días para sesión persistente

export interface AuthUser {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  id_rol: number;
  nombre_rol: 'Administrador' | 'Profesor' | 'Estudiante';
  id_estudiante: number | null;
  id_profesor: number | null;
  id_administrador: number | null;
  id_grado: number | null;
  nombre_grado: string | null;
  codigo_estudiantil: string | null;
  especialidad: string | null;
  nivel_acceso: string | null;
  puntos_saldo: number;
  fondo_activo: string | null;
  estilo_activo: string | null;
}

export function hashOpaqueToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function signSessionToken(
  userId: number,
  sessionVersion = 1,
  ttlMs = ACCESS_TOKEN_TTL_MS
): string {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, sv: sessionVersion, iat: now, exp: now + ttlMs })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { uid: number; sv: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded.uid !== 'number') return null;
    if (typeof decoded.exp === 'number' && decoded.exp < Date.now()) return null;
    const sv = typeof decoded.sv === 'number' ? decoded.sv : 1;
    return { uid: decoded.uid, sv };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

export function loadUserProfile(userId: number): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.id_rol, r.nombre_rol,
              u.puntos_saldo, u.fondo_activo, u.estilo_activo,
              e.id_estudiante, e.codigo_estudiantil, e.id_grado as est_grado,
              p.id_profesor, p.especialidad, p.id_grado as prof_grado,
              a.id_administrador, a.nivel_acceso
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
       LEFT JOIN estudiante e ON e.id_usuario = u.id_usuario
       LEFT JOIN profesor p ON p.id_usuario = u.id_usuario
       LEFT JOIN administrador a ON a.id_usuario = u.id_usuario
       WHERE u.id_usuario = ?`
    )
    .get(userId) as
    | {
        id_usuario: number;
        nombre: string;
        apellido: string;
        email: string;
        id_rol: number;
        nombre_rol: 'Administrador' | 'Profesor' | 'Estudiante';
        puntos_saldo: number;
        fondo_activo: string | null;
        estilo_activo: string | null;
        id_estudiante: number | null;
        codigo_estudiantil: string | null;
        est_grado: number | null;
        id_profesor: number | null;
        especialidad: string | null;
        prof_grado: number | null;
        id_administrador: number | null;
        nivel_acceso: string | null;
      }
    | undefined;

  if (!row) return null;

  const activeGradoId =
    row.nombre_rol === 'Estudiante'
      ? row.est_grado
      : row.nombre_rol === 'Profesor'
        ? row.prof_grado
        : null;

  let nombre_grado: string | null = null;
  if (activeGradoId !== null) {
    const g = db.prepare('SELECT nombre_grado, seccion FROM grado WHERE id_grado = ?').get(activeGradoId) as
      | { nombre_grado: string; seccion: string | null }
      | undefined;
    if (g) {
      nombre_grado = g.seccion ? `${g.nombre_grado} (${g.seccion})` : g.nombre_grado;
    }
  }

  return {
    id_usuario: row.id_usuario,
    nombre: row.nombre,
    apellido: row.apellido,
    email: row.email,
    id_rol: row.id_rol,
    nombre_rol: row.nombre_rol,
    id_estudiante: row.id_estudiante,
    id_profesor: row.id_profesor,
    id_administrador: row.id_administrador,
    id_grado: activeGradoId,
    nombre_grado,
    codigo_estudiantil: row.codigo_estudiantil,
    especialidad: row.especialidad,
    nivel_acceso: row.nivel_acceso,
    puntos_saldo: Number(row.puntos_saldo ?? 0),
    fondo_activo: row.fondo_activo ?? null,
    estilo_activo: row.estilo_activo ?? null,
  };
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function getUserSessionVersion(userId: number): number | null {
  const row = db
    .prepare('SELECT session_version FROM usuario WHERE id_usuario = ?')
    .get(userId) as { session_version: number } | undefined;
  return row ? row.session_version : null;
}

export function issueSessionTokens(params: {
  idUsuario: number;
  sessionVersion: number;
  persistent: boolean;
  expiresAtOverrideMs?: number;
}): {
  accessToken: string;
  refreshToken: string;
  persistent: boolean;
  expiresAtMs: number;
} {
  const now = Date.now();
  const expiresAtMs =
    params.expiresAtOverrideMs ??
    now + (params.persistent ? PERSISTENT_SESSION_TTL_MS : TEMPORARY_SESSION_TTL_MS);

  const accessToken = signSessionToken(params.idUsuario, params.sessionVersion, ACCESS_TOKEN_TTL_MS);
  const refreshToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashOpaqueToken(refreshToken);

  db.prepare(
    `INSERT INTO refresh_token (id_usuario, token_hash, persistente, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(params.idUsuario, tokenHash, params.persistent ? 1 : 0, expiresAtMs, now);

  return {
    accessToken,
    refreshToken,
    persistent: params.persistent,
    expiresAtMs,
  };
}

export function revokeRefreshToken(rawToken: string | undefined | null): void {
  if (!rawToken || !rawToken.trim()) return;
  const hash = hashOpaqueToken(rawToken.trim());
  db.prepare('UPDATE refresh_token SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(
    Date.now(),
    hash
  );
}

export function revokeAllUserSessions(userId: number): void {
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    db.prepare('UPDATE usuario SET session_version = session_version + 1 WHERE id_usuario = ?').run(userId);
    db.prepare('UPDATE refresh_token SET revoked_at = ? WHERE id_usuario = ? AND revoked_at IS NULL').run(
      now,
      userId
    );
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

export function rotateRefreshToken(rawToken: string):
  | {
      ok: true;
      user: AuthUser;
      accessToken: string;
      refreshToken: string;
      persistent: boolean;
      expiresAtMs: number;
    }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' | 'REUSE_DETECTED' } {
  const trimmed = rawToken.trim();
  if (!trimmed) return { ok: false, reason: 'INVALID' };

  const tokenHash = hashOpaqueToken(trimmed);
  const row = db
    .prepare(
      `SELECT id_refresh_token, id_usuario, persistente, expires_at, revoked_at
       FROM refresh_token
       WHERE token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id_refresh_token: number;
        id_usuario: number;
        persistente: number;
        expires_at: number;
        revoked_at: number | null;
      }
    | undefined;

  if (!row) {
    return { ok: false, reason: 'INVALID' };
  }

  // Protección contra secuestro de sesión: si un token ya rotado/revocado vuelve a usarse,
  // invalidamos todas las sesiones del usuario en todos los dispositivos.
  if (row.revoked_at !== null) {
    revokeAllUserSessions(Number(row.id_usuario));
    return { ok: false, reason: 'REUSE_DETECTED' };
  }

  const now = Date.now();
  if (Number(row.expires_at) <= now) {
    db.prepare('UPDATE refresh_token SET revoked_at = ? WHERE id_refresh_token = ?').run(
      now,
      row.id_refresh_token
    );
    return { ok: false, reason: 'EXPIRED' };
  }

  const sv = getUserSessionVersion(Number(row.id_usuario));
  const profile = loadUserProfile(Number(row.id_usuario));
  if (sv === null || !profile) {
    return { ok: false, reason: 'INVALID' };
  }

  const persistent = Number(row.persistente) === 1;
  let issued: ReturnType<typeof issueSessionTokens>;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    db.prepare(
      'UPDATE refresh_token SET revoked_at = ?, last_used_at = ? WHERE id_refresh_token = ?'
    ).run(now, now, row.id_refresh_token);

    issued = issueSessionTokens({
      idUsuario: profile.id_usuario,
      sessionVersion: sv,
      persistent,
      expiresAtOverrideMs: Number(row.expires_at),
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

  return {
    ok: true,
    user: profile,
    accessToken: issued.accessToken,
    refreshToken: issued.refreshToken,
    persistent,
    expiresAtMs: issued.expiresAtMs,
  };
}

export function setAuthCookies(
  req: Request,
  res: Response,
  params: {
    accessToken: string;
    refreshToken: string;
    persistent: boolean;
    expiresAtMs: number;
  }
): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const baseCookie: CookieOptions = {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  };

  if (params.persistent) {
    const refreshMaxAge = Math.max(1000, params.expiresAtMs - Date.now());
    res.cookie(SESSION_COOKIE_NAME, params.accessToken, {
      ...baseCookie,
      path: '/',
      maxAge: ACCESS_TOKEN_TTL_MS,
    });
    res.cookie(REFRESH_COOKIE_NAME, params.refreshToken, {
      ...baseCookie,
      path: '/api/auth',
      maxAge: refreshMaxAge,
    });
  } else {
    // Cookies de sesión sin maxAge: expiran al cerrar el navegador
    res.cookie(SESSION_COOKIE_NAME, params.accessToken, {
      ...baseCookie,
      path: '/',
    });
    res.cookie(REFRESH_COOKIE_NAME, params.refreshToken, {
      ...baseCookie,
      path: '/api/auth',
    });
  }
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
}

export function attachAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  let token = cookies[SESSION_COOKIE_NAME];
  const authHeader = req.headers.authorization;
  if (!token && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (token) {
    const verified = verifySessionToken(token);
    if (verified !== null) {
      const currentVersion = getUserSessionVersion(verified.uid);
      if (currentVersion !== null && currentVersion === verified.sv) {
        const profile = loadUserProfile(verified.uid);
        if (profile) req.user = profile;
      }
    }
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Debes iniciar sesión para acceder a este recurso.' });
    return;
  }
  next();
}

export function requireRole(...roles: Array<'Administrador' | 'Profesor' | 'Estudiante'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Debes iniciar sesión para acceder a este recurso.' });
      return;
    }
    if (!roles.includes(req.user.nombre_rol)) {
      res.status(403).json({
        error: `Acceso denegado (403). Se requiere rol: ${roles.join(' o ')}.`,
      });
      return;
    }
    next();
  };
}
