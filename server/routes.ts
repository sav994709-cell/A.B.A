import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.ts';
import {
  type AuthedRequest,
  clearAuthCookies,
  getUserSessionVersion,
  hashOpaqueToken,
  issueSessionTokens,
  loadUserProfile,
  parseCookies,
  REFRESH_COOKIE_NAME,
  requireAuth,
  requireRole,
  revokeAllUserSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  setAuthCookies,
} from './auth.ts';
import { getDevOutbox, sendPasswordResetEmail } from './mailer.ts';
import { getEvaluationLeaderboard, recordEvaluationScore } from './leaderboard.ts';
import {
  equipReward,
  getStoreSnapshot,
  grantActivityPoints,
  hasCompletedActivity,
  listPointRules,
  redeemReward,
  updatePointRule,
} from './rewards.ts';
import {
  createDuelRoom,
  getRoomSnapshot,
  joinDuelRoom,
  listUserDuelHistory,
  submitDuelAnswer,
} from './duels.ts';
import {
  checkLoginAllowed,
  extractClientIp,
  listAuthAuditEvents,
  recordFailedLoginAttempt,
  resetLoginAttemptsOnSuccess,
} from './loginGuard.ts';
import {
  getAccountDetails,
  updateOwnAccount,
  updateOwnPassword,
} from './account.ts';
import {
  hashPassword,
  verifyDummyPassword,
  verifyPassword,
} from './passwordCrypto.ts';
import { getTimeReport, upsertSessionActivity } from './timeHistory.ts';
import { getUserVideoLearningStats, recordVideoView } from './videoAnalytics.ts';
import { getPrivateStudentReport, getTeacherAcademicReport } from './academicReports.ts';
import {
  closeVirtualRoom,
  createVirtualRoom,
  getVirtualRoomDetails,
  listActiveVirtualRooms,
} from './virtualRooms.ts';
import {
  searchSaberesCatalog,
  type SaberCategory,
  type SaberCompletionFilter,
} from '../src/lib/saberesSearch.ts';
import {
  buildAdminActivityReport,
  type ActivityIntensity,
  type ReportGranularity,
  type ReportPeriodPreset,
} from './adminActivityReports.ts';
import {
  getTelemetryControlReport,
  ingestTelemetryBatchSync,
  telemetryCaptureMiddleware,
  type TelemetryEventInput,
} from './telemetry.ts';
import {
  createSurveyDefinition,
  getSurveyDefinitionById,
  getSurveyStatisticalReport,
  listSurveyDefinitions,
  submitSurveyResponses,
  type SurveyQuestionType,
} from './surveyAnalytics.ts';

export const apiRouter = Router();
apiRouter.use(telemetryCaptureMiddleware);

// --- AUTH ---
apiRouter.post('/auth/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    res.status(400).json({ error: 'Ingresa tu correo institucional y contraseña.' });
    return;
  }

  const clientIp = extractClientIp(req);
  const lockCheck = checkLoginAllowed(email, clientIp);
  if (!lockCheck.allowed) {
    res.setHeader('Retry-After', String(lockCheck.retryAfterSeconds));
    res.status(429).json({
      error: lockCheck.error,
      retryAfterSeconds: lockCheck.retryAfterSeconds,
    });
    return;
  }

  const userRow = db
    .prepare('SELECT id_usuario, password_hash, session_version FROM usuario WHERE LOWER(email) = ?')
    .get(email) as { id_usuario: number; password_hash: string; session_version: number } | undefined;

  if (!userRow) {
    // Comparación ficticia en tiempo constante para evitar filtración temporal de existencia de cuenta
    verifyDummyPassword(password);
    const failResult = recordFailedLoginAttempt(email, clientIp);
    if (failResult.lockedNow) {
      res.setHeader('Retry-After', String(failResult.retryAfterSeconds));
      res.status(429).json({
        error: failResult.error,
        retryAfterSeconds: failResult.retryAfterSeconds,
      });
      return;
    }
    res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
    return;
  }

  const pwVerify = verifyPassword(password, userRow.password_hash);
  if (!pwVerify.valid) {
    const failResult = recordFailedLoginAttempt(email, clientIp);
    if (failResult.lockedNow) {
      res.setHeader('Retry-After', String(failResult.retryAfterSeconds));
      res.status(429).json({
        error: failResult.error,
        retryAfterSeconds: failResult.retryAfterSeconds,
      });
      return;
    }
    res.status(401).json({ error: 'Credenciales inválidas. Verifica tu correo y contraseña.' });
    return;
  }

  // Migración transparente: si la contraseña estaba con bcrypt o hash legado/menor costo, rehashear con scrypt
  if (pwVerify.needsUpgrade && pwVerify.upgradedHash) {
    db.prepare('UPDATE usuario SET password_hash = ? WHERE id_usuario = ?').run(
      pwVerify.upgradedHash,
      userRow.id_usuario
    );
  }

  const profile = loadUserProfile(userRow.id_usuario);
  if (!profile) {
    res.status(404).json({ error: 'Perfil de usuario no encontrado.' });
    return;
  }

  resetLoginAttemptsOnSuccess(email, clientIp);

  const issued = issueSessionTokens({
    idUsuario: profile.id_usuario,
    sessionVersion: userRow.session_version ?? 1,
    persistent: false,
  });

  setAuthCookies(req, res, issued);

  res.json({
    user: profile,
    token: issued.accessToken,
    refreshToken: issued.refreshToken,
    persistent: false,
  });
});

apiRouter.post('/auth/session-preference', requireAuth, (req: AuthedRequest, res) => {
  if (typeof req.body?.persistent !== 'boolean') {
    res.status(400).json({ error: 'Debes indicar si deseas mantener la sesión iniciada.' });
    return;
  }

  const persistent = req.body.persistent;
  const cookies = parseCookies(req.headers.cookie);
  const oldRefresh =
    (typeof req.body?.refresh_token === 'string' && req.body.refresh_token) ||
    cookies[REFRESH_COOKIE_NAME] ||
    null;

  if (oldRefresh) {
    revokeRefreshToken(oldRefresh);
  }

  const sv = getUserSessionVersion(req.user!.id_usuario) ?? 1;
  const issued = issueSessionTokens({
    idUsuario: req.user!.id_usuario,
    sessionVersion: sv,
    persistent,
  });

  setAuthCookies(req, res, issued);

  res.json({
    ok: true,
    persistent,
    token: issued.accessToken,
    refreshToken: issued.refreshToken,
    expiresAtMs: issued.expiresAtMs,
  });
});

apiRouter.post('/auth/refresh', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const rawRefresh =
    (typeof req.body?.refresh_token === 'string' && req.body.refresh_token.trim()) ||
    cookies[REFRESH_COOKIE_NAME] ||
    '';

  if (!rawRefresh) {
    clearAuthCookies(res);
    res.status(401).json({ code: 'MISSING_REFRESH', error: 'No hay token de renovación activo.' });
    return;
  }

  const rotated = rotateRefreshToken(rawRefresh);
  if (!rotated.ok) {
    clearAuthCookies(res);
    res.status(401).json({
      code: rotated.reason,
      error:
        rotated.reason === 'REUSE_DETECTED'
          ? 'Se detectó un uso indebido de sesión. Por seguridad se cerraron todas tus sesiones.'
          : 'Tu sesión expiró. Inicia sesión nuevamente.',
    });
    return;
  }

  setAuthCookies(req, res, rotated);

  res.json({
    user: rotated.user,
    token: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    persistent: rotated.persistent,
    expiresAtMs: rotated.expiresAtMs,
  });
});

apiRouter.post('/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const rawRefresh =
    (typeof req.body?.refresh_token === 'string' && req.body.refresh_token) ||
    cookies[REFRESH_COOKIE_NAME] ||
    null;
  if (rawRefresh) {
    revokeRefreshToken(rawRefresh);
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});

apiRouter.post('/auth/logout-all', requireAuth, (req: AuthedRequest, res) => {
  revokeAllUserSessions(req.user!.id_usuario);
  clearAuthCookies(res);
  res.json({
    ok: true,
    message: 'Se cerraron todas tus sesiones activas en todos los dispositivos.',
  });
});

apiRouter.get('/auth/me', (req: AuthedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No hay sesión activa.' });
    return;
  }
  res.json({ user: req.user });
});

// --- MI CUENTA (solo usuario autenticado sobre su propio perfil) ---
apiRouter.get('/account', requireAuth, (req: AuthedRequest, res) => {
  const details = getAccountDetails(req.user!.id_usuario);
  if (!details) {
    res.status(404).json({ error: 'No se encontró la cuenta del usuario.' });
    return;
  }
  res.json(details);
});

apiRouter.put('/account', requireAuth, (req: AuthedRequest, res) => {
  const result = updateOwnAccount({
    userId: req.user!.id_usuario,
    nombre: req.body?.nombre,
    apellido: req.body?.apellido,
    email: req.body?.email,
    id_grado: req.body?.id_grado,
    especialidad: req.body?.especialidad,
    current_password: req.body?.current_password,
  });

  if (!result.ok) {
    res.status(result.status).json({ code: result.code, error: result.error });
    return;
  }

  res.json({
    message: result.emailChanged
      ? 'Tus datos y correo electrónico se actualizaron correctamente.'
      : 'Tus datos de cuenta se actualizaron correctamente.',
    user: result.user,
  });
});

apiRouter.put('/account/password', requireAuth, (req: AuthedRequest, res) => {
  const cookies = parseCookies(req.headers.cookie);
  let persistent = req.body?.persistent === true;
  const cookieRefresh = cookies[REFRESH_COOKIE_NAME];
  if (!persistent && cookieRefresh) {
    const rtRow = db
      .prepare('SELECT persistente FROM refresh_token WHERE token_hash = ?')
      .get(hashOpaqueToken(cookieRefresh)) as { persistente: number } | undefined;
    if (rtRow && Number(rtRow.persistente) === 1) {
      persistent = true;
    }
  }

  const result = updateOwnPassword({
    userId: req.user!.id_usuario,
    current_password: req.body?.current_password,
    new_password: req.body?.new_password,
    confirm_password: req.body?.confirm_password,
  });

  if (!result.ok) {
    res.status(result.status).json({ code: result.code, error: result.error });
    return;
  }

  const issued = issueSessionTokens({
    idUsuario: req.user!.id_usuario,
    sessionVersion: result.sessionVersion,
    persistent,
  });

  setAuthCookies(req, res, issued);

  res.json({
    message: 'Tu contraseña se actualizó correctamente y se cerraron tus demás sesiones activas.',
    token: issued.accessToken,
    refreshToken: issued.refreshToken,
    persistent: issued.persistent,
  });
});

// Lista pública mínima de cuentas demo para acceso rápido de evaluación
apiRouter.get('/auth/demo-accounts', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.email, r.nombre_rol
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.id_usuario IN (1, 4, 6)
       ORDER BY u.id_rol ASC`
    )
    .all();
  res.json({ accounts: rows });
});

apiRouter.get('/auth/grados', (_req, res) => {
  const grados = db
    .prepare('SELECT id_grado, nombre_grado, seccion FROM grado ORDER BY id_grado ASC')
    .all();
  res.json({ grados });
});

apiRouter.post('/auth/register', (req, res) => {
  const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
  const apellido = typeof req.body?.apellido === 'string' ? req.body.apellido.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const idGradoRaw = Number(req.body?.id_grado);

  if (!email) {
    res.status(400).json({ error: 'El correo electrónico es obligatorio.' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (email.length > 150 || !emailRegex.test(email)) {
    res.status(400).json({
      error: 'El formato del correo electrónico no es válido. Verifica que incluya @ y dominio.',
    });
    return;
  }

  if (!nombre || !apellido) {
    res.status(400).json({ error: 'Ingresa tu nombre y apellido para completar el registro.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    return;
  }

  const existing = db
    .prepare('SELECT id_usuario FROM usuario WHERE LOWER(email) = ?')
    .get(email) as { id_usuario: number } | undefined;

  if (existing) {
    res.status(409).json({
      error: 'Este correo electrónico ya se encuentra registrado. Si la cuenta te pertenece, inicia sesión.',
    });
    return;
  }

  const gradoExists =
    Number.isInteger(idGradoRaw) &&
    Boolean(db.prepare('SELECT id_grado FROM grado WHERE id_grado = ?').get(idGradoRaw));
  const idGrado = gradoExists ? idGradoRaw : 1;

  const passwordHash = hashPassword(password);

  db.exec('BEGIN TRANSACTION;');
  let newUserId = 0;
  try {
    const uInfo = db
      .prepare('INSERT INTO usuario (nombre, apellido, email, password_hash, id_rol) VALUES (?, ?, ?, ?, ?)')
      .run(nombre, apellido, email, passwordHash, 3);
    newUserId = Number(uInfo.lastInsertRowid);

    const codigoEstudiantil = `EST-2026-${String(newUserId).padStart(3, '0')}`;
    db.prepare('INSERT INTO estudiante (id_usuario, id_grado, codigo_estudiantil) VALUES (?, ?, ?)').run(
      newUserId,
      idGrado,
      codigoEstudiantil
    );
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: 'No se pudo completar el registro. Verifica los datos ingresados.' });
    return;
  }

  const profile = loadUserProfile(newUserId);
  if (!profile) {
    res.status(500).json({ error: 'Error interno al cargar el nuevo perfil.' });
    return;
  }

  const sv = getUserSessionVersion(profile.id_usuario) ?? 1;
  const issued = issueSessionTokens({
    idUsuario: profile.id_usuario,
    sessionVersion: sv,
    persistent: false,
  });

  setAuthCookies(req, res, issued);

  res.status(201).json({
    message: '¡Registro exitoso! Tu cuenta en A.B.A. ha sido creada correctamente.',
    user: profile,
    token: issued.accessToken,
    refreshToken: issued.refreshToken,
    persistent: false,
  });
});

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutos

function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

apiRouter.post('/auth/forgot-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!email || email.length > 150 || !emailRegex.test(email)) {
    res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
    return;
  }

  const genericMessage =
    'Si el correo electrónico está registrado en A.B.A., recibirás un enlace de restablecimiento válido por 15 minutos.';

  const user = db
    .prepare('SELECT id_usuario, nombre, email FROM usuario WHERE LOWER(email) = ?')
    .get(email) as { id_usuario: number; nombre: string; email: string } | undefined;

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(rawToken);
    const now = Date.now();
    const expiresAt = now + RESET_TOKEN_TTL_MS;

    db.exec('BEGIN TRANSACTION;');
    try {
      // Invalidar tokens previos no utilizados del mismo usuario
      db.prepare('UPDATE password_reset_token SET used_at = ? WHERE id_usuario = ? AND used_at IS NULL').run(
        now,
        user.id_usuario
      );
      db.prepare(
        'INSERT INTO password_reset_token (id_usuario, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)'
      ).run(user.id_usuario, tokenHash, expiresAt, now);
      db.exec('COMMIT;');
    } catch {
      db.exec('ROLLBACK;');
      res.status(500).json({ error: 'No se pudo procesar la solicitud en este momento.' });
      return;
    }

    const originHeader = req.headers.origin;
    const baseUrl =
      typeof originHeader === 'string' && originHeader.startsWith('http')
        ? originHeader
        : process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? process.env.APP_URL
          : `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/?reset_token=${encodeURIComponent(rawToken)}`;

    await sendPasswordResetEmail({
      to: user.email,
      nombre: user.nombre,
      resetUrl,
      expiresMinutes: 15,
    });
  }

  // Respuesta idéntica exista o no el correo para evitar enumeración de cuentas
  res.json({ message: genericMessage });
});

apiRouter.get('/auth/reset-password/validate', (req, res) => {
  const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!rawToken) {
    res.status(400).json({
      valid: false,
      code: 'INVALID_TOKEN',
      error: 'El enlace de restablecimiento no es válido.',
    });
    return;
  }

  const tokenHash = hashResetToken(rawToken);
  const row = db
    .prepare('SELECT id_token, expires_at, used_at FROM password_reset_token WHERE token_hash = ?')
    .get(tokenHash) as { id_token: number; expires_at: number; used_at: number | null } | undefined;

  if (!row) {
    res.status(404).json({
      valid: false,
      code: 'INVALID_TOKEN',
      error: 'El enlace de restablecimiento no es válido o no existe.',
    });
    return;
  }

  if (row.used_at !== null) {
    res.status(410).json({
      valid: false,
      code: 'TOKEN_USED',
      error: 'Este enlace ya fue utilizado. Solicita uno nuevo si necesitas cambiar tu contraseña.',
    });
    return;
  }

  if (row.expires_at < Date.now()) {
    res.status(410).json({
      valid: false,
      code: 'TOKEN_EXPIRED',
      error: 'Este enlace ha caducado. Por seguridad los enlaces vencen en 15 minutos.',
    });
    return;
  }

  res.json({ valid: true });
});

apiRouter.post('/auth/reset-password', (req, res) => {
  const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

  if (!rawToken) {
    res.status(400).json({
      code: 'INVALID_TOKEN',
      error: 'El enlace de restablecimiento no es válido.',
    });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({
      code: 'WEAK_PASSWORD',
      error: 'La nueva contraseña debe tener al menos 6 caracteres.',
    });
    return;
  }

  if (confirmPassword !== password) {
    res.status(400).json({
      code: 'PASSWORD_MISMATCH',
      error: 'Las contraseñas ingresadas no coinciden.',
    });
    return;
  }

  const tokenHash = hashResetToken(rawToken);
  const now = Date.now();

  const row = db
    .prepare('SELECT id_token, id_usuario, expires_at, used_at FROM password_reset_token WHERE token_hash = ?')
    .get(tokenHash) as
    | { id_token: number; id_usuario: number; expires_at: number; used_at: number | null }
    | undefined;

  if (!row) {
    res.status(404).json({
      code: 'INVALID_TOKEN',
      error: 'El enlace de restablecimiento no es válido o no existe.',
    });
    return;
  }

  if (row.used_at !== null) {
    res.status(410).json({
      code: 'TOKEN_USED',
      error: 'Este enlace ya fue utilizado. Solicita uno nuevo si necesitas cambiar tu contraseña.',
    });
    return;
  }

  if (row.expires_at < now) {
    res.status(410).json({
      code: 'TOKEN_EXPIRED',
      error: 'Este enlace ha caducado. Solicita un nuevo correo de recuperación.',
    });
    return;
  }

  const newHash = hashPassword(password);

  db.exec('BEGIN TRANSACTION;');
  try {
    // Actualizar contraseña e incrementar session_version para cerrar todas las sesiones activas
    db.prepare(
      'UPDATE usuario SET password_hash = ?, session_version = session_version + 1 WHERE id_usuario = ?'
    ).run(newHash, row.id_usuario);

    // Invalidar el token actual y cualquier otro token pendiente del usuario
    db.prepare('UPDATE password_reset_token SET used_at = ? WHERE id_usuario = ? AND used_at IS NULL').run(
      now,
      row.id_usuario
    );
    // Revocar todos los refresh tokens activos al cambiar contraseña
    db.prepare('UPDATE refresh_token SET revoked_at = ? WHERE id_usuario = ? AND revoked_at IS NULL').run(
      now,
      row.id_usuario
    );
    db.exec('COMMIT;');
  } catch {
    db.exec('ROLLBACK;');
    res.status(500).json({ error: 'No se pudo actualizar la contraseña.' });
    return;
  }

  clearAuthCookies(res);
  res.json({
    message: 'Tu contraseña ha sido actualizada y se cerraron tus sesiones anteriores. Ya puedes iniciar sesión.',
  });
});

// Buzón de pruebas únicamente en entorno de desarrollo (cuando no hay proveedor SMTP/Resend)
apiRouter.get('/auth/dev-outbox', (_req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.RESEND_API_KEY) {
    res.status(404).json({ error: 'No disponible.' });
    return;
  }
  res.json({ emails: getDevOutbox() });
});

// --- GRADOS Y SABERES ---
apiRouter.get('/grados', requireAuth, (_req, res) => {
  const grados = db
    .prepare(
      `SELECT g.id_grado, g.nombre_grado, g.seccion,
              COUNT(DISTINCT s.id_saber) as total_saberes,
              COUNT(DISTINCT e.id_estudiante) as total_estudiantes
       FROM grado g
       LEFT JOIN saber s ON s.id_grado = g.id_grado
       LEFT JOIN estudiante e ON e.id_grado = g.id_grado
       GROUP BY g.id_grado
       ORDER BY g.id_grado ASC`
    )
    .all();
  res.json({ grados });
});

apiRouter.get('/saberes', requireAuth, (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const idGrado = req.query.id_grado ? Number(req.query.id_grado) : null;

  let sql = `
    SELECT s.id_saber, s.titulo, s.descripcion, s.id_grado,
           g.nombre_grado, g.seccion
    FROM saber s
    JOIN grado g ON g.id_grado = s.id_grado
    WHERE 1=1
  `;
  const params: Array<string | number> = [];

  if (idGrado && Number.isInteger(idGrado)) {
    sql += ' AND s.id_grado = ?';
    params.push(idGrado);
  }
  if (q) {
    sql += ' AND (s.titulo LIKE ? OR s.descripcion LIKE ? OR g.nombre_grado LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY s.id_grado ASC, s.id_saber ASC';

  const saberes = db.prepare(sql).all(...params) as Array<{
    id_saber: number;
    titulo: string;
    descripcion: string | null;
    id_grado: number;
    nombre_grado: string;
    seccion: string | null;
  }>;

  const videosStmt = db.prepare('SELECT id_video, titulo, url_video, duracion_segundos, id_saber FROM video WHERE id_saber = ?');
  const evalsStmt = db.prepare('SELECT id_evaluacion, titulo, instrucciones, id_saber FROM evaluacion WHERE id_saber = ?');
  const questionsStmt = db.prepare(
    `SELECT r.enunciado_pregunta
     FROM respuestas r
     JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion
     WHERE e.id_saber = ?
     ORDER BY r.id_respuesta ASC`
  );
  const puntajeStmt = db.prepare(
    `SELECT calificacion, fecha_realizacion
     FROM puntaje
     WHERE id_estudiante = ? AND id_evaluacion = ?
     ORDER BY fecha_realizacion DESC, id_puntaje DESC LIMIT 1`
  );

  const enriched = saberes.map((s) => {
    const videos = videosStmt.all(s.id_saber) as Array<{
      id_video: number;
      titulo: string;
      url_video: string;
      duracion_segundos: number | null;
      id_saber: number;
    }>;
    const evaluaciones = (evalsStmt.all(s.id_saber) as Array<{
      id_evaluacion: number;
      titulo: string;
      instrucciones: string | null;
      id_saber: number;
    }>).map((ev) => {
      let ultimo_puntaje = null;
      if (req.user?.id_estudiante) {
        ultimo_puntaje = puntajeStmt.get(req.user.id_estudiante, ev.id_evaluacion) ?? null;
      }
      return { ...ev, ultimo_puntaje };
    });
    const preguntas_enunciados = (
      questionsStmt.all(s.id_saber) as Array<{ enunciado_pregunta: string }>
    ).map((r) => r.enunciado_pregunta);

    return {
      ...s,
      videos,
      evaluaciones,
      preguntas_enunciados,
    };
  });

  res.json({ saberes: enriched });
});

apiRouter.get('/saberes/buscar', requireAuth, (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const idGradoRaw = req.query.id_grado ? Number(req.query.id_grado) : null;
  const idGrado = idGradoRaw && Number.isInteger(idGradoRaw) && idGradoRaw > 0 ? idGradoRaw : 'all';
  const categoriaRaw = typeof req.query.categoria === 'string' ? req.query.categoria.trim() : 'all';
  const categoria = (
    ['Matemáticas y Lógica', 'Lenguaje y Lectura', 'Ciencias y Entorno', 'General'].includes(
      categoriaRaw
    )
      ? categoriaRaw
      : 'all'
  ) as SaberCategory | 'all';
  const estadoRaw = typeof req.query.estado === 'string' ? req.query.estado.trim() : 'all';
  const estado = (
    ['pendientes', 'completados'].includes(estadoRaw) ? estadoRaw : 'all'
  ) as SaberCompletionFilter;

  const saberes = db
    .prepare(
      `SELECT s.id_saber, s.titulo, s.descripcion, s.id_grado,
              g.nombre_grado, g.seccion
       FROM saber s
       JOIN grado g ON g.id_grado = s.id_grado
       ORDER BY s.id_grado ASC, s.id_saber ASC`
    )
    .all() as Array<{
    id_saber: number;
    titulo: string;
    descripcion: string | null;
    id_grado: number;
    nombre_grado: string;
    seccion: string | null;
  }>;

  const videosStmt = db.prepare(
    'SELECT id_video, titulo, url_video, duracion_segundos, id_saber FROM video WHERE id_saber = ?'
  );
  const evalsStmt = db.prepare(
    'SELECT id_evaluacion, titulo, instrucciones, id_saber FROM evaluacion WHERE id_saber = ?'
  );
  const questionsStmt = db.prepare(
    `SELECT r.enunciado_pregunta
     FROM respuestas r
     JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion
     WHERE e.id_saber = ?
     ORDER BY r.id_respuesta ASC`
  );
  const puntajeStmt = db.prepare(
    `SELECT calificacion, fecha_realizacion
     FROM puntaje
     WHERE id_estudiante = ? AND id_evaluacion = ?
     ORDER BY fecha_realizacion DESC, id_puntaje DESC LIMIT 1`
  );

  const catalog = saberes.map((s) => {
    const videos = videosStmt.all(s.id_saber) as Array<{
      id_video: number;
      titulo: string;
      url_video: string;
      duracion_segundos: number | null;
      id_saber: number;
    }>;
    const evaluaciones = (
      evalsStmt.all(s.id_saber) as Array<{
        id_evaluacion: number;
        titulo: string;
        instrucciones: string | null;
        id_saber: number;
      }>
    ).map((ev) => ({
      ...ev,
      ultimo_puntaje: req.user?.id_estudiante
        ? ((puntajeStmt.get(req.user.id_estudiante, ev.id_evaluacion) as
            | { calificacion: number; fecha_realizacion: string }
            | undefined) ?? null)
        : null,
    }));
    const preguntas_enunciados = (
      questionsStmt.all(s.id_saber) as Array<{ enunciado_pregunta: string }>
    ).map((r) => r.enunciado_pregunta);

    return {
      ...s,
      videos,
      evaluaciones,
      preguntas_enunciados,
    };
  });

  const searchResult = searchSaberesCatalog({
    saberes: catalog,
    query: q,
    idGrado,
    categoria,
    estado,
  });

  res.json({
    query: q,
    total_resultados: searchResult.hits.length,
    did_you_mean: searchResult.didYouMean,
    used_fuzzy_fallback: searchResult.usedFuzzyFallback,
    resultados: searchResult.hits,
  });
});

apiRouter.get('/saberes/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'Saber de aprendizaje no encontrado.' });
    return;
  }

  const saber = db
    .prepare(
      `SELECT s.id_saber, s.titulo, s.descripcion, s.id_grado, g.nombre_grado, g.seccion
       FROM saber s
       JOIN grado g ON g.id_grado = s.id_grado
       WHERE s.id_saber = ?`
    )
    .get(id);

  if (!saber) {
    res.status(404).json({ error: 'Saber de aprendizaje no encontrado.' });
    return;
  }

  const videos = db
    .prepare('SELECT id_video, titulo, url_video, duracion_segundos, id_saber FROM video WHERE id_saber = ?')
    .all(id);

  const evaluaciones = (
    db
      .prepare('SELECT id_evaluacion, titulo, instrucciones, id_saber FROM evaluacion WHERE id_saber = ?')
      .all(id) as Array<{ id_evaluacion: number; titulo: string; instrucciones: string | null; id_saber: number }>
  ).map((ev) => {
    const totalPreguntas = (
      db.prepare('SELECT COUNT(*) as total FROM respuestas WHERE id_evaluacion = ?').get(ev.id_evaluacion) as {
        total: number;
      }
    ).total;
    const ultimo_puntaje = req.user?.id_estudiante
      ? (db
          .prepare(
            `SELECT id_puntaje, calificacion, fecha_realizacion
             FROM puntaje
             WHERE id_estudiante = ? AND id_evaluacion = ?
             ORDER BY fecha_realizacion DESC, id_puntaje DESC LIMIT 1`
          )
          .get(req.user.id_estudiante, ev.id_evaluacion) ?? null)
      : null;

    return { ...ev, total_preguntas: totalPreguntas, ultimo_puntaje };
  });

  res.json({ saber, videos, evaluaciones });
});

// --- VIDEOS EDUCATIVOS ---
apiRouter.get('/videos', requireAuth, (req: AuthedRequest, res) => {
  const idUsuario = req.user!.id_usuario;
  const rows = db
    .prepare(
      `SELECT v.id_video, v.titulo, v.url_video, v.duracion_segundos, v.id_saber,
              s.titulo as saber_titulo, s.id_grado, g.nombre_grado, g.seccion,
              CASE WHEN vf.id_favorito IS NOT NULL THEN 1 ELSE 0 END as es_favorito_num
       FROM video v
       JOIN saber s ON s.id_saber = v.id_saber
       JOIN grado g ON g.id_grado = s.id_grado
       LEFT JOIN video_favorito vf ON vf.id_video = v.id_video AND vf.id_usuario = ?
       ORDER BY v.id_video ASC`
    )
    .all(idUsuario) as Array<Record<string, unknown>>;

  const videos = rows.map(({ es_favorito_num, ...rest }) => ({
    ...rest,
    es_favorito: Boolean(es_favorito_num),
  }));
  res.json({ videos });
});

apiRouter.get('/videos/favoritos', requireAuth, (req: AuthedRequest, res) => {
  const idUsuario = req.user!.id_usuario;
  const rows = db
    .prepare(
      `SELECT v.id_video, v.titulo, v.url_video, v.duracion_segundos, v.id_saber,
              s.titulo as saber_titulo, s.id_grado, g.nombre_grado, g.seccion,
              vf.creado_en as favorito_creado_en
       FROM video_favorito vf
       INNER JOIN video v ON v.id_video = vf.id_video
       INNER JOIN saber s ON s.id_saber = v.id_saber
       INNER JOIN grado g ON g.id_grado = s.id_grado
       WHERE vf.id_usuario = ?
       ORDER BY vf.creado_en DESC, vf.id_favorito DESC`
    )
    .all(idUsuario) as Array<Record<string, unknown>>;

  const favoritos = rows.map((row) => ({
    ...row,
    es_favorito: true,
  }));

  res.json({ favoritos });
});

apiRouter.get('/videos/estadisticas/mias', requireAuth, (req: AuthedRequest, res) => {
  const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined;
  const hasta = typeof req.query.hasta === 'string' ? req.query.hasta : undefined;
  const estadisticas = getUserVideoLearningStats(req.user!.id_usuario, { desde, hasta });
  res.json(estadisticas);
});

apiRouter.get('/videos/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'Video educativo no encontrado.' });
    return;
  }

  const video = db
    .prepare(
      `SELECT v.id_video, v.titulo, v.url_video, v.duracion_segundos, v.id_saber,
              s.titulo as saber_titulo, s.descripcion as saber_descripcion, s.id_grado,
              g.nombre_grado, g.seccion
       FROM video v
       JOIN saber s ON s.id_saber = v.id_saber
       JOIN grado g ON g.id_grado = s.id_grado
       WHERE v.id_video = ?`
    )
    .get(id) as { id_saber: number; id_grado: number; titulo: string } | undefined;

  if (!video) {
    res.status(404).json({ error: 'Video educativo no encontrado.' });
    return;
  }

  const relacionados = db
    .prepare(
      `SELECT v.id_video, v.titulo, v.url_video, v.duracion_segundos, v.id_saber,
              s.titulo as saber_titulo, g.nombre_grado
       FROM video v
       JOIN saber s ON s.id_saber = v.id_saber
       JOIN grado g ON g.id_grado = s.id_grado
       WHERE v.id_video != ?
       ORDER BY (s.id_grado = ?) DESC, v.id_video ASC
       LIMIT 6`
    )
    .all(id, video.id_grado);

  const evaluaciones = db
    .prepare('SELECT id_evaluacion, titulo, instrucciones FROM evaluacion WHERE id_saber = ?')
    .all(video.id_saber);

  const completadoPorUsuario = hasCompletedActivity(req.user!.id_usuario, 'video', id);
  const favRow = db
    .prepare('SELECT 1 as ok FROM video_favorito WHERE id_usuario = ? AND id_video = ?')
    .get(req.user!.id_usuario, id);

  res.json({
    video,
    relacionados,
    evaluaciones,
    completado_por_usuario: completadoPorUsuario,
    es_favorito: Boolean(favRow),
  });
});

apiRouter.post('/videos/:id/favorito', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'Video educativo no encontrado.' });
    return;
  }

  const video = db.prepare('SELECT id_video FROM video WHERE id_video = ?').get(id);
  if (!video) {
    res.status(404).json({ error: 'Video educativo no encontrado.' });
    return;
  }

  const info = db
    .prepare('INSERT OR IGNORE INTO video_favorito (id_usuario, id_video) VALUES (?, ?)')
    .run(req.user!.id_usuario, id);

  res.status(info.changes > 0 ? 201 : 200).json({
    ok: true,
    id_video: id,
    es_favorito: true,
    ya_existia: info.changes === 0,
  });
});

apiRouter.delete('/videos/:id/favorito', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'Video educativo no encontrado.' });
    return;
  }

  const info = db
    .prepare('DELETE FROM video_favorito WHERE id_usuario = ? AND id_video = ?')
    .run(req.user!.id_usuario, id);

  res.json({
    ok: true,
    id_video: id,
    es_favorito: false,
    eliminado: info.changes > 0,
  });
});

apiRouter.post('/videos/:id/visualizacion', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const result = recordVideoView({
    idUsuario: req.user!.id_usuario,
    idVideo: id,
    sessionViewId: typeof body.session_view_id === 'string' ? body.session_view_id : undefined,
    duracionVistaSegundos:
      typeof body.duracion_vista_segundos === 'number' ? body.duracion_vista_segundos : undefined,
    posicionMaxSegundos:
      typeof body.posicion_max_segundos === 'number' ? body.posicion_max_segundos : undefined,
    completado: typeof body.completado === 'boolean' ? body.completado : undefined,
    fechaVisualizacionUtc:
      typeof body.fecha_visualizacion_utc === 'string' ? body.fecha_visualizacion_utc : undefined,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(result.deduplicado ? 200 : 201).json(result);
});

apiRouter.post('/videos/:id/completar', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'Video educativo no encontrado.' });
    return;
  }

  const video = db
    .prepare('SELECT id_video, titulo, duracion_segundos FROM video WHERE id_video = ?')
    .get(id) as { id_video: number; titulo: string; duracion_segundos: number | null } | undefined;

  if (!video) {
    res.status(404).json({ error: 'Video educativo no encontrado.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const fallbackDur = Math.max(0, Math.round(video.duracion_segundos ?? 180));
  recordVideoView({
    idUsuario: req.user!.id_usuario,
    idVideo: id,
    sessionViewId: typeof body.session_view_id === 'string' ? body.session_view_id : undefined,
    duracionVistaSegundos:
      typeof body.duracion_vista_segundos === 'number' ? body.duracion_vista_segundos : fallbackDur,
    posicionMaxSegundos:
      typeof body.posicion_max_segundos === 'number' ? body.posicion_max_segundos : fallbackDur,
    completado: true,
  });

  const resultadoPuntos = grantActivityPoints({
    idUsuario: req.user!.id_usuario,
    fuente: 'video',
    referenciaId: id,
    titulo: video.titulo,
  });

  res.json({
    ok: true,
    id_video: id,
    ...resultadoPuntos,
  });
});

// --- EVALUACIONES INTERACTIVAS ABC ---
apiRouter.get('/evaluaciones/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'Evaluación no encontrada.' });
    return;
  }

  const evaluacion = db
    .prepare(
      `SELECT e.id_evaluacion, e.titulo, e.instrucciones, e.id_saber,
              s.titulo as saber_titulo, s.id_grado, g.nombre_grado
       FROM evaluacion e
       JOIN saber s ON s.id_saber = e.id_saber
       JOIN grado g ON g.id_grado = s.id_grado
       WHERE e.id_evaluacion = ?`
    )
    .get(id);

  if (!evaluacion) {
    res.status(404).json({ error: 'Evaluación no encontrada.' });
    return;
  }

  // No exponemos opcion_correcta al cliente antes de responder
  const preguntas = db
    .prepare(
      `SELECT id_respuesta, enunciado_pregunta, opcion_a, opcion_b, opcion_c, id_evaluacion
       FROM respuestas
       WHERE id_evaluacion = ?
       ORDER BY id_respuesta ASC`
    )
    .all(id);

  const historial = req.user
    ? db
        .prepare(
          `SELECT id_puntaje, calificacion, fecha_realizacion
           FROM puntaje
           WHERE id_usuario = ? AND id_evaluacion = ?
           ORDER BY fecha_realizacion DESC, id_puntaje DESC LIMIT 5`
        )
        .all(req.user.id_usuario, id)
    : [];

  res.json({ evaluacion, preguntas, historial });
});

apiRouter.get('/evaluaciones/:id/leaderboard', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'Evaluación no encontrada.' });
    return;
  }

  const evaluacion = db
    .prepare('SELECT id_evaluacion FROM evaluacion WHERE id_evaluacion = ?')
    .get(id);

  if (!evaluacion) {
    res.status(404).json({ error: 'Evaluación no encontrada.' });
    return;
  }

  const entries = getEvaluationLeaderboard(id, req.user!.id_usuario);
  res.json({ evaluacion_id: id, entries });
});

apiRouter.post('/evaluaciones/:id/responder', requireAuth, (req: AuthedRequest, res) => {
  const idEvaluacion = Number(req.params.id);
  if (!Number.isInteger(idEvaluacion) || idEvaluacion <= 0) {
    res.status(404).json({ error: 'Evaluación no encontrada.' });
    return;
  }

  const evaluacion = db
    .prepare('SELECT id_evaluacion, titulo, id_saber FROM evaluacion WHERE id_evaluacion = ?')
    .get(idEvaluacion) as { id_evaluacion: number; titulo: string; id_saber: number } | undefined;

  if (!evaluacion) {
    res.status(404).json({ error: 'Evaluación no encontrada.' });
    return;
  }

  const respuestasUsuario = req.body?.respuestas as Record<string, string> | undefined;
  if (!respuestasUsuario || typeof respuestasUsuario !== 'object') {
    res.status(400).json({ error: 'Debes seleccionar una respuesta válida (A, B o C).' });
    return;
  }

  const preguntas = db
    .prepare('SELECT id_respuesta, enunciado_pregunta, opcion_a, opcion_b, opcion_c FROM respuestas WHERE id_evaluacion = ?')
    .all(idEvaluacion) as Array<{
    id_respuesta: number;
    enunciado_pregunta: string;
    opcion_a: string;
    opcion_b: string;
    opcion_c: string;
  }>;

  if (preguntas.length === 0) {
    res.status(400).json({ error: 'Esta evaluación aún no tiene preguntas configuradas.' });
    return;
  }

  const correctaStmt = db.prepare(
    'SELECT opcion_correcta, explicacion FROM respuesta_correcta WHERE id_respuesta = ?'
  );
  const incorrectaExactaStmt = db.prepare(
    'SELECT retroalimentacion FROM respuesta_incorrecta WHERE id_respuesta = ? AND opcion_incorrecta = ?'
  );
  const incorrectaGeneralStmt = db.prepare(
    'SELECT retroalimentacion FROM respuesta_incorrecta WHERE id_respuesta = ? LIMIT 1'
  );

  let aciertos = 0;
  const detalle = [];

  for (const p of preguntas) {
    const elegidaRaw = respuestasUsuario[String(p.id_respuesta)];
    const elegida = typeof elegidaRaw === 'string' ? elegidaRaw.trim().toUpperCase() : '';
    if (!['A', 'B', 'C'].includes(elegida)) {
      res.status(400).json({
        error: `Selecciona una opción válida (A, B o C) para la pregunta: "${p.enunciado_pregunta}".`,
      });
      return;
    }

    const correcta = correctaStmt.get(p.id_respuesta) as
      | { opcion_correcta: 'A' | 'B' | 'C'; explicacion: string | null }
      | undefined;

    if (!correcta) {
      res.status(500).json({ error: 'Falta configurar la respuesta correcta en la base de datos.' });
      return;
    }

    const esCorrecta = elegida === correcta.opcion_correcta;
    if (esCorrecta) {
      aciertos += 1;
      detalle.push({
        id_respuesta: p.id_respuesta,
        enunciado_pregunta: p.enunciado_pregunta,
        opcion_elegida: elegida,
        opcion_correcta: correcta.opcion_correcta,
        es_correcta: true,
        mensaje: correcta.explicacion || '¡Excelente trabajo! Respuesta correcta.',
      });
    } else {
      const incExact = incorrectaExactaStmt.get(p.id_respuesta, elegida) as
        | { retroalimentacion: string | null }
        | undefined;
      const incFallback = incExact
        ? incExact
        : (incorrectaGeneralStmt.get(p.id_respuesta) as { retroalimentacion: string | null } | undefined);

      detalle.push({
        id_respuesta: p.id_respuesta,
        enunciado_pregunta: p.enunciado_pregunta,
        opcion_elegida: elegida,
        opcion_correcta: correcta.opcion_correcta,
        es_correcta: false,
        mensaje:
          incFallback?.retroalimentacion ||
          'Esta opción no es correcta. Revisa el enunciado e inténtalo de nuevo.',
        explicacion_correcta: correcta.explicacion,
      });
    }
  }

  // Escala decimal 0.00 - 5.00 consistente con `puntaje.calificacion` en vers.txt
  const calificacion = Number(((aciertos / preguntas.length) * 5).toFixed(2));
  const porcentaje = Number(((aciertos / preguntas.length) * 100).toFixed(2));

  const puntajeGuardado = recordEvaluationScore({
    idUsuario: req.user!.id_usuario,
    idEstudiante: req.user?.id_estudiante ?? null,
    idEvaluacion,
    calificacion,
  });

  const leaderboard = getEvaluationLeaderboard(idEvaluacion, req.user!.id_usuario);
  const puntosOtorgados = grantActivityPoints({
    idUsuario: req.user!.id_usuario,
    fuente: 'evaluacion',
    referenciaId: idEvaluacion,
    titulo: evaluacion.titulo,
  });

  res.json({
    calificacion,
    porcentaje,
    aciertos,
    total_preguntas: preguntas.length,
    puntaje_guardado: puntajeGuardado,
    leaderboard,
    puntos_otorgados: puntosOtorgados,
    detalle,
  });
});

// --- TIENDA DE RECOMPENSAS Y PUNTOS ---
apiRouter.get('/tienda', requireAuth, (req: AuthedRequest, res) => {
  const snapshot = getStoreSnapshot(req.user!.id_usuario);
  res.json(snapshot);
});

apiRouter.post('/tienda/canjear', requireAuth, (req: AuthedRequest, res) => {
  const idRecompensa = Number(req.body?.id_recompensa);
  if (!Number.isInteger(idRecompensa) || idRecompensa <= 0) {
    res.status(400).json({ error: 'Selecciona una recompensa válida para canjear.' });
    return;
  }

  const result = redeemReward(req.user!.id_usuario, idRecompensa);
  if (!result.ok) {
    res.status(result.status).json({ code: result.code, error: result.error });
    return;
  }

  res.json(result);
});

apiRouter.post('/tienda/equipar', requireAuth, (req: AuthedRequest, res) => {
  const categoria = req.body?.categoria;
  const codigoRaw = req.body?.codigo;

  if (categoria !== 'fondo' && categoria !== 'estilo') {
    res.status(400).json({ error: 'Categoría de personalización inválida.' });
    return;
  }

  const codigo = codigoRaw === null || codigoRaw === '' ? null : typeof codigoRaw === 'string' ? codigoRaw.trim() : undefined;
  if (codigo === undefined) {
    res.status(400).json({ error: 'Código de recompensa inválido.' });
    return;
  }

  const result = equipReward(req.user!.id_usuario, categoria, codigo);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json(result);
});

apiRouter.get('/tienda/reglas', requireAuth, (_req, res) => {
  res.json({ reglas: listPointRules() });
});

apiRouter.put('/tienda/reglas/:clave', requireRole('Administrador'), (req, res) => {
  const clave = req.params.clave;
  if (clave !== 'evaluacion_completada' && clave !== 'video_visto') {
    res.status(404).json({ error: 'Regla de puntos no encontrada.' });
    return;
  }

  const puntosBase = Number(req.body?.puntos_base);
  const puntosAdicionales = Number(req.body?.puntos_adicionales);

  if (
    !Number.isInteger(puntosBase) ||
    puntosBase < 0 ||
    !Number.isInteger(puntosAdicionales) ||
    puntosAdicionales < 0
  ) {
    res.status(400).json({ error: 'Los puntos base y adicionales deben ser enteros iguales o mayores a 0.' });
    return;
  }

  const updated = updatePointRule(clave, puntosBase, puntosAdicionales);
  res.json({ regla: updated });
});

// --- DASHBOARD DE PROGRESO Y REPORTES ---
apiRouter.get('/dashboard/progreso', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;

  const totalSaberes = (db.prepare('SELECT COUNT(*) as total FROM saber').get() as { total: number }).total;
  const totalEvaluaciones = (db.prepare('SELECT COUNT(*) as total FROM evaluacion').get() as { total: number }).total;
  const totalVideos = (db.prepare('SELECT COUNT(*) as total FROM video').get() as { total: number }).total;

  if (user.nombre_rol === 'Estudiante') {
    const idEst = user.id_estudiante;
    const puntajes = idEst
      ? (db
          .prepare(
            `SELECT p.id_puntaje, p.id_evaluacion, p.calificacion, p.fecha_realizacion,
                    e.titulo as evaluacion_titulo, s.id_saber, s.titulo as saber_titulo,
                    g.nombre_grado
             FROM puntaje p
             JOIN evaluacion e ON e.id_evaluacion = p.id_evaluacion
             JOIN saber s ON s.id_saber = e.id_saber
             JOIN grado g ON g.id_grado = s.id_grado
             WHERE p.id_estudiante = ?
             ORDER BY p.fecha_realizacion DESC, p.id_puntaje DESC`
          )
          .all(idEst) as Array<{
          id_puntaje: number;
          id_evaluacion: number;
          calificacion: number;
          fecha_realizacion: string;
          evaluacion_titulo: string;
          id_saber: number;
          saber_titulo: string;
          nombre_grado: string;
        }>)
      : [];

    const evaluacionesCompletadas = new Set(puntajes.map((p) => p.id_evaluacion)).size;
    const promedioSobre5 =
      puntajes.length > 0
        ? Number((puntajes.reduce((acc, p) => acc + Number(p.calificacion), 0) / puntajes.length).toFixed(2))
        : 0;
    const promedioSobre100 = Number((promedioSobre5 * 20).toFixed(2));
    const progresoPorcentaje =
      totalEvaluaciones > 0 ? Number(((evaluacionesCompletadas / totalEvaluaciones) * 100).toFixed(2)) : 0;

    // Último puntaje por cada evaluación para la gráfica A/B/C
    const todasEvaluaciones = db
      .prepare(
        `SELECT e.id_evaluacion, e.titulo, s.titulo as saber_titulo, g.nombre_grado
         FROM evaluacion e
         JOIN saber s ON s.id_saber = e.id_saber
         JOIN grado g ON g.id_grado = s.id_grado
         ORDER BY e.id_evaluacion ASC`
      )
      .all() as Array<{ id_evaluacion: number; titulo: string; saber_titulo: string; nombre_grado: string }>;

    const grafica = todasEvaluaciones.map((ev) => {
      const match = puntajes.find((p) => p.id_evaluacion === ev.id_evaluacion);
      return {
        id_evaluacion: ev.id_evaluacion,
        titulo: ev.titulo,
        saber_titulo: ev.saber_titulo,
        nombre_grado: ev.nombre_grado,
        calificacion: match ? Number(match.calificacion) : 0,
        porcentaje: match ? Number((Number(match.calificacion) * 20).toFixed(2)) : 0,
        completada: Boolean(match),
      };
    });

    const ultimaEncuesta = db
      .prepare('SELECT calificacion_estrellas, comentario, fecha_registro FROM encuesta_satisfaccion WHERE id_usuario = ? ORDER BY id_encuesta DESC LIMIT 1')
      .get(user.id_usuario);

    res.json({
      rol: 'Estudiante',
      resumen: {
        promedio_sobre_5: promedioSobre5,
        promedio_sobre_100: promedioSobre100,
        progreso_porcentaje: progresoPorcentaje,
        evaluaciones_completadas: evaluacionesCompletadas,
        total_evaluaciones: totalEvaluaciones,
        total_saberes: totalSaberes,
        total_videos: totalVideos,
      },
      puntajes,
      grafica,
      ultima_encuesta: ultimaEncuesta ?? null,
    });
    return;
  }

  // Profesor o Administrador: métricas globales y por grado
  const puntajesGlobales = db
    .prepare(
      `SELECT p.id_puntaje, p.calificacion, p.fecha_realizacion,
              e.id_evaluacion, e.titulo as evaluacion_titulo,
              s.titulo as saber_titulo,
              est.id_estudiante, est.codigo_estudiantil, est.id_grado,
              u.nombre, u.apellido, g.nombre_grado
       FROM puntaje p
       JOIN evaluacion e ON e.id_evaluacion = p.id_evaluacion
       JOIN saber s ON s.id_saber = e.id_saber
       JOIN estudiante est ON est.id_estudiante = p.id_estudiante
       JOIN usuario u ON u.id_usuario = est.id_usuario
       JOIN grado g ON g.id_grado = est.id_grado
       ORDER BY p.fecha_realizacion DESC`
    )
    .all() as Array<{
    id_puntaje: number;
    calificacion: number;
    fecha_realizacion: string;
    id_evaluacion: number;
    evaluacion_titulo: string;
    saber_titulo: string;
    id_estudiante: number;
    codigo_estudiantil: string;
    id_grado: number;
    nombre: string;
    apellido: string;
    nombre_grado: string;
  }>;

  const promedioGlobal5 =
    puntajesGlobales.length > 0
      ? Number((puntajesGlobales.reduce((acc, p) => acc + Number(p.calificacion), 0) / puntajesGlobales.length).toFixed(2))
      : 0;

  const graficaEvaluaciones = db
    .prepare(
      `SELECT e.id_evaluacion, e.titulo, s.titulo as saber_titulo,
              ROUND(AVG(p.calificacion), 2) as promedio_5,
              COUNT(p.id_puntaje) as intentos
       FROM evaluacion e
       JOIN saber s ON s.id_saber = e.id_saber
       LEFT JOIN puntaje p ON p.id_evaluacion = e.id_evaluacion
       GROUP BY e.id_evaluacion
       ORDER BY e.id_evaluacion ASC`
    )
    .all() as Array<{
    id_evaluacion: number;
    titulo: string;
    saber_titulo: string;
    promedio_5: number | null;
    intentos: number;
  }>;

  res.json({
    rol: user.nombre_rol,
    resumen: {
      promedio_sobre_5: promedioGlobal5,
      promedio_sobre_100: Number((promedioGlobal5 * 20).toFixed(2)),
      total_registros_puntaje: puntajesGlobales.length,
      total_evaluaciones: totalEvaluaciones,
      total_saberes: totalSaberes,
      total_videos: totalVideos,
    },
    puntajes: puntajesGlobales,
    grafica: graficaEvaluaciones.map((g) => ({
      id_evaluacion: g.id_evaluacion,
      titulo: g.titulo,
      saber_titulo: g.saber_titulo,
      calificacion: g.promedio_5 ?? 0,
      porcentaje: g.promedio_5 ? Number((g.promedio_5 * 20).toFixed(2)) : 0,
      intentos: g.intentos,
      completada: g.intentos > 0,
    })),
  });
});

apiRouter.post('/encuestas', requireAuth, (req: AuthedRequest, res) => {
  const estrellas = Number(req.body?.calificacion_estrellas);
  const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim().slice(0, 500) : null;

  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    res.status(400).json({ error: 'Selecciona una calificación entre 1 y 5 estrellas.' });
    return;
  }

  db.prepare(
    'INSERT INTO encuesta_satisfaccion (id_usuario, calificacion_estrellas, comentario) VALUES (?, ?, ?)'
  ).run(req.user!.id_usuario, estrellas, comentario);

  res.json({ ok: true, calificacion_estrellas: estrellas, comentario });
});

// --- PANEL DEL PROFESOR ---
apiRouter.get('/profesor/panel', requireRole('Profesor', 'Administrador'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const filtroGrado = req.query.id_grado ? Number(req.query.id_grado) : user.id_grado;

  const grados = db
    .prepare('SELECT id_grado, nombre_grado, seccion FROM grado ORDER BY id_grado ASC')
    .all();

  const estudiantesSql = `
    SELECT est.id_estudiante, est.codigo_estudiantil, est.id_grado,
           u.id_usuario, u.nombre, u.apellido, u.email,
           g.nombre_grado, g.seccion,
           COUNT(p.id_puntaje) as evaluaciones_realizadas,
           ROUND(AVG(p.calificacion), 2) as promedio_calificacion
    FROM estudiante est
    JOIN usuario u ON u.id_usuario = est.id_usuario
    JOIN grado g ON g.id_grado = est.id_grado
    LEFT JOIN puntaje p ON p.id_estudiante = est.id_estudiante
    ${filtroGrado ? 'WHERE est.id_grado = ?' : ''}
    GROUP BY est.id_estudiante
    ORDER BY est.id_grado ASC, u.apellido ASC
  `;
  const estudiantes = filtroGrado
    ? db.prepare(estudiantesSql).all(filtroGrado)
    : db.prepare(estudiantesSql).all();

  const puntajesSql = `
    SELECT p.id_puntaje, p.calificacion, p.fecha_realizacion,
           e.id_evaluacion, e.titulo as evaluacion_titulo,
           s.titulo as saber_titulo,
           est.id_estudiante, est.codigo_estudiantil,
           u.nombre, u.apellido,
           g.id_grado, g.nombre_grado
    FROM puntaje p
    JOIN evaluacion e ON e.id_evaluacion = p.id_evaluacion
    JOIN saber s ON s.id_saber = e.id_saber
    JOIN estudiante est ON est.id_estudiante = p.id_estudiante
    JOIN usuario u ON u.id_usuario = est.id_usuario
    JOIN grado g ON g.id_grado = est.id_grado
    ${filtroGrado ? 'WHERE est.id_grado = ?' : ''}
    ORDER BY p.fecha_realizacion DESC, p.id_puntaje DESC
  `;
  const puntajes = filtroGrado
    ? db.prepare(puntajesSql).all(filtroGrado)
    : db.prepare(puntajesSql).all();

  res.json({
    grado_asignado_id: user.id_grado,
    especialidad: user.especialidad,
    filtro_grado_id: filtroGrado ?? null,
    grados,
    estudiantes,
    puntajes,
  });
});

// --- PANEL DEL ADMINISTRADOR (CRUD COMPLETO) ---
apiRouter.get('/admin/resumen', requireRole('Administrador'), (_req, res) => {
  const roles = db.prepare('SELECT id_rol, nombre_rol FROM rol ORDER BY id_rol ASC').all();
  const grados = db.prepare('SELECT id_grado, nombre_grado, seccion FROM grado ORDER BY id_grado ASC').all();
  const usuarios = db
    .prepare(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.id_rol, r.nombre_rol,
              a.nivel_acceso,
              p.id_grado as prof_grado, p.especialidad,
              e.id_grado as est_grado, e.codigo_estudiantil
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
       LEFT JOIN administrador a ON a.id_usuario = u.id_usuario
       LEFT JOIN profesor p ON p.id_usuario = u.id_usuario
       LEFT JOIN estudiante e ON e.id_usuario = u.id_usuario
       ORDER BY u.id_usuario ASC`
    )
    .all();

  const saberes = db
    .prepare(
      `SELECT s.id_saber, s.titulo, s.descripcion, s.id_grado, g.nombre_grado, g.seccion
       FROM saber s
       JOIN grado g ON g.id_grado = s.id_grado
       ORDER BY s.id_saber ASC`
    )
    .all();

  const videos = db
    .prepare(
      `SELECT v.id_video, v.titulo, v.url_video, v.duracion_segundos, v.id_saber, s.titulo as saber_titulo
       FROM video v
       JOIN saber s ON s.id_saber = v.id_saber
       ORDER BY v.id_video ASC`
    )
    .all();

  const evaluaciones = db
    .prepare(
      `SELECT e.id_evaluacion, e.titulo, e.instrucciones, e.id_saber, s.titulo as saber_titulo
       FROM evaluacion e
       JOIN saber s ON s.id_saber = e.id_saber
       ORDER BY e.id_evaluacion ASC`
    )
    .all();

  const preguntas = db
    .prepare(
      `SELECT r.id_respuesta, r.enunciado_pregunta, r.opcion_a, r.opcion_b, r.opcion_c, r.id_evaluacion,
              e.titulo as evaluacion_titulo,
              rc.opcion_correcta, rc.explicacion,
              ri.opcion_incorrecta, ri.retroalimentacion
       FROM respuestas r
       JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion
       LEFT JOIN respuesta_correcta rc ON rc.id_respuesta = r.id_respuesta
       LEFT JOIN respuesta_incorrecta ri ON ri.id_respuesta = r.id_respuesta
       GROUP BY r.id_respuesta
       ORDER BY r.id_respuesta ASC`
    )
    .all();

  res.json({ roles, grados, usuarios, saberes, videos, evaluaciones, preguntas });
});

// CRUD Usuarios
apiRouter.post('/admin/usuarios', requireRole('Administrador'), (req, res) => {
  const { nombre, apellido, email, password, id_rol, id_grado, codigo_estudiantil, especialidad, nivel_acceso } =
    req.body ?? {};

  if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password || !id_rol) {
    res.status(400).json({ error: 'Nombre, apellido, correo, contraseña y rol son obligatorios.' });
    return;
  }

  const existing = db.prepare('SELECT id_usuario FROM usuario WHERE LOWER(email) = ?').get(email.trim().toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'Ya existe un usuario registrado con ese correo electrónico.' });
    return;
  }

  const passwordHash = hashPassword(String(password));
  const roleId = Number(id_rol);

  db.exec('BEGIN TRANSACTION;');
  try {
    const uRes = db
      .prepare('INSERT INTO usuario (nombre, apellido, email, password_hash, id_rol) VALUES (?, ?, ?, ?, ?)')
      .run(nombre.trim(), apellido.trim(), email.trim().toLowerCase(), passwordHash, roleId);
    const userId = Number(uRes.lastInsertRowid);

    if (roleId === 1) {
      db.prepare('INSERT INTO administrador (id_usuario, nivel_acceso) VALUES (?, ?)').run(
        userId,
        nivel_acceso?.trim() || 'Admin Académico'
      );
    } else if (roleId === 2) {
      db.prepare('INSERT INTO profesor (id_usuario, id_grado, especialidad) VALUES (?, ?, ?)').run(
        userId,
        Number(id_grado) || 1,
        especialidad?.trim() || 'Pedagogía General'
      );
    } else if (roleId === 3) {
      const code = codigo_estudiantil?.trim() || `EST-2026-${String(userId).padStart(3, '0')}`;
      db.prepare('INSERT INTO estudiante (id_usuario, id_grado, codigo_estudiantil) VALUES (?, ?, ?)').run(
        userId,
        Number(id_grado) || 1,
        code
      );
    }

    db.exec('COMMIT;');
    res.status(201).json({ id_usuario: userId });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: (err as Error).message });
  }
});

apiRouter.put('/admin/usuarios/:id', requireRole('Administrador'), (req, res) => {
  const id = Number(req.params.id);
  const { nombre, apellido, email, password, id_rol, id_grado, especialidad, nivel_acceso } = req.body ?? {};
  if (!Number.isInteger(id) || !nombre?.trim() || !apellido?.trim() || !email?.trim() || !id_rol) {
    res.status(400).json({ error: 'Datos incompletos para actualizar el usuario.' });
    return;
  }

  const existing = db.prepare('SELECT id_usuario FROM usuario WHERE id_usuario = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }

  const dup = db
    .prepare('SELECT id_usuario FROM usuario WHERE LOWER(email) = ? AND id_usuario != ?')
    .get(email.trim().toLowerCase(), id);
  if (dup) {
    res.status(409).json({ error: 'Ese correo ya pertenece a otro usuario.' });
    return;
  }

  const roleId = Number(id_rol);
  db.exec('BEGIN TRANSACTION;');
  try {
    if (password && String(password).trim().length > 0) {
      const hash = hashPassword(String(password));
      db.prepare('UPDATE usuario SET nombre = ?, apellido = ?, email = ?, password_hash = ?, id_rol = ? WHERE id_usuario = ?').run(
        nombre.trim(),
        apellido.trim(),
        email.trim().toLowerCase(),
        hash,
        roleId,
        id
      );
    } else {
      db.prepare('UPDATE usuario SET nombre = ?, apellido = ?, email = ?, id_rol = ? WHERE id_usuario = ?').run(
        nombre.trim(),
        apellido.trim(),
        email.trim().toLowerCase(),
        roleId,
        id
      );
    }

    if (roleId === 1) {
      const hasAdmin = db.prepare('SELECT id_administrador FROM administrador WHERE id_usuario = ?').get(id);
      if (hasAdmin) {
        db.prepare('UPDATE administrador SET nivel_acceso = ? WHERE id_usuario = ?').run(
          nivel_acceso?.trim() || 'SuperAdmin',
          id
        );
      } else {
        db.prepare('INSERT INTO administrador (id_usuario, nivel_acceso) VALUES (?, ?)').run(
          id,
          nivel_acceso?.trim() || 'Admin Académico'
        );
      }
    } else if (roleId === 2) {
      const hasProf = db.prepare('SELECT id_profesor FROM profesor WHERE id_usuario = ?').get(id);
      if (hasProf) {
        db.prepare('UPDATE profesor SET id_grado = ?, especialidad = ? WHERE id_usuario = ?').run(
          Number(id_grado) || 1,
          especialidad?.trim() || 'Pedagogía General',
          id
        );
      } else {
        db.prepare('INSERT INTO profesor (id_usuario, id_grado, especialidad) VALUES (?, ?, ?)').run(
          id,
          Number(id_grado) || 1,
          especialidad?.trim() || 'Pedagogía General'
        );
      }
    } else if (roleId === 3) {
      const hasEst = db.prepare('SELECT id_estudiante FROM estudiante WHERE id_usuario = ?').get(id);
      if (hasEst) {
        db.prepare('UPDATE estudiante SET id_grado = ? WHERE id_usuario = ?').run(Number(id_grado) || 1, id);
      } else {
        db.prepare('INSERT INTO estudiante (id_usuario, id_grado, codigo_estudiantil) VALUES (?, ?, ?)').run(
          id,
          Number(id_grado) || 1,
          `EST-2026-${String(id).padStart(3, '0')}`
        );
      }
    }

    db.exec('COMMIT;');
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: (err as Error).message });
  }
});

apiRouter.delete('/admin/usuarios/:id', requireRole('Administrador'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (req.user?.id_usuario === id) {
    res.status(400).json({ error: 'No puedes eliminar tu propia cuenta mientras tienes sesión activa.' });
    return;
  }
  const info = db.prepare('DELETE FROM usuario WHERE id_usuario = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }
  res.json({ ok: true });
});

// CRUD Grados
apiRouter.post('/admin/grados', requireRole('Administrador'), (req, res) => {
  const { nombre_grado, seccion } = req.body ?? {};
  if (!nombre_grado?.trim()) {
    res.status(400).json({ error: 'El nombre del grado es obligatorio.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO grado (nombre_grado, seccion) VALUES (?, ?)')
    .run(nombre_grado.trim(), seccion?.trim() || null);
  res.status(201).json({ id_grado: Number(info.lastInsertRowid) });
});

apiRouter.put('/admin/grados/:id', requireRole('Administrador'), (req, res) => {
  const id = Number(req.params.id);
  const { nombre_grado, seccion } = req.body ?? {};
  if (!nombre_grado?.trim()) {
    res.status(400).json({ error: 'El nombre del grado es obligatorio.' });
    return;
  }
  const info = db
    .prepare('UPDATE grado SET nombre_grado = ?, seccion = ? WHERE id_grado = ?')
    .run(nombre_grado.trim(), seccion?.trim() || null, id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Grado no encontrado.' });
    return;
  }
  res.json({ ok: true });
});

apiRouter.delete('/admin/grados/:id', requireRole('Administrador'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM grado WHERE id_grado = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Grado no encontrado.' });
    return;
  }
  res.json({ ok: true });
});

// CRUD Saberes
apiRouter.post('/admin/saberes', requireRole('Administrador'), (req, res) => {
  const { titulo, descripcion, id_grado } = req.body ?? {};
  if (!titulo?.trim() || !id_grado) {
    res.status(400).json({ error: 'El título y el grado del saber son obligatorios.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO saber (titulo, descripcion, id_grado) VALUES (?, ?, ?)')
    .run(titulo.trim(), descripcion?.trim() || null, Number(id_grado));
  res.status(201).json({ id_saber: Number(info.lastInsertRowid) });
});

apiRouter.put('/admin/saberes/:id', requireRole('Administrador'), (req, res) => {
  const id = Number(req.params.id);
  const { titulo, descripcion, id_grado } = req.body ?? {};
  if (!titulo?.trim() || !id_grado) {
    res.status(400).json({ error: 'El título y el grado del saber son obligatorios.' });
    return;
  }
  const info = db
    .prepare('UPDATE saber SET titulo = ?, descripcion = ?, id_grado = ? WHERE id_saber = ?')
    .run(titulo.trim(), descripcion?.trim() || null, Number(id_grado), id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Saber no encontrado.' });
    return;
  }
  res.json({ ok: true });
});

apiRouter.delete('/admin/saberes/:id', requireRole('Administrador'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM saber WHERE id_saber = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Saber no encontrado.' });
    return;
  }
  res.json({ ok: true });
});

// CRUD Videos
apiRouter.post('/admin/videos', requireRole('Administrador'), (req, res) => {
  const { titulo, url_video, duracion_segundos, id_saber } = req.body ?? {};
  if (!titulo?.trim() || !url_video?.trim() || !id_saber) {
    res.status(400).json({ error: 'Título, URL y saber asociado son obligatorios.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO video (titulo, url_video, duracion_segundos, id_saber) VALUES (?, ?, ?, ?)')
    .run(titulo.trim(), url_video.trim(), duracion_segundos ? Number(duracion_segundos) : 180, Number(id_saber));
  res.status(201).json({ id_video: Number(info.lastInsertRowid) });
});

apiRouter.delete('/admin/videos/:id', requireRole('Administrador'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM video WHERE id_video = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Video no encontrado.' });
    return;
  }
  res.json({ ok: true });
});

// CRUD Evaluaciones y Preguntas
apiRouter.post('/admin/evaluaciones', requireRole('Administrador'), (req, res) => {
  const { titulo, instrucciones, id_saber } = req.body ?? {};
  if (!titulo?.trim() || !id_saber) {
    res.status(400).json({ error: 'Título y saber asociado son obligatorios.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO evaluacion (titulo, instrucciones, id_saber) VALUES (?, ?, ?)')
    .run(titulo.trim(), instrucciones?.trim() || null, Number(id_saber));
  res.status(201).json({ id_evaluacion: Number(info.lastInsertRowid) });
});

apiRouter.delete('/admin/evaluaciones/:id', requireRole('Administrador'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM evaluacion WHERE id_evaluacion = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Evaluación no encontrada.' });
    return;
  }
  res.json({ ok: true });
});

apiRouter.post('/admin/preguntas', requireRole('Administrador'), (req, res) => {
  const {
    id_evaluacion,
    enunciado_pregunta,
    opcion_a,
    opcion_b,
    opcion_c,
    opcion_correcta,
    explicacion,
    retroalimentacion_incorrecta,
  } = req.body ?? {};

  if (!id_evaluacion || !enunciado_pregunta?.trim() || !opcion_a?.trim() || !opcion_b?.trim() || !opcion_c?.trim()) {
    res.status(400).json({ error: 'Todos los campos de la pregunta y opciones A, B, C son obligatorios.' });
    return;
  }
  if (!['A', 'B', 'C'].includes(opcion_correcta)) {
    res.status(400).json({ error: 'La opción correcta debe ser A, B o C.' });
    return;
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    const rInfo = db
      .prepare(
        'INSERT INTO respuestas (enunciado_pregunta, opcion_a, opcion_b, opcion_c, id_evaluacion) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        enunciado_pregunta.trim(),
        opcion_a.trim(),
        opcion_b.trim(),
        opcion_c.trim(),
        Number(id_evaluacion)
      );
    const idRespuesta = Number(rInfo.lastInsertRowid);

    db.prepare('INSERT INTO respuesta_correcta (id_respuesta, opcion_correcta, explicacion) VALUES (?, ?, ?)').run(
      idRespuesta,
      opcion_correcta,
      explicacion?.trim() || '¡Respuesta correcta!'
    );

    const incorrectOptions = (['A', 'B', 'C'] as const).filter((opt) => opt !== opcion_correcta);
    const incStmt = db.prepare(
      'INSERT INTO respuesta_incorrecta (id_respuesta, opcion_incorrecta, retroalimentacion) VALUES (?, ?, ?)'
    );
    for (const opt of incorrectOptions) {
      incStmt.run(
        idRespuesta,
        opt,
        retroalimentacion_incorrecta?.trim() || 'Revisa el contenido del saber y vuelve a intentarlo.'
      );
    }

    db.exec('COMMIT;');
    res.status(201).json({ id_respuesta: idRespuesta });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(400).json({ error: (err as Error).message });
  }
});

apiRouter.delete('/admin/preguntas/:id', requireRole('Administrador'), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM respuestas WHERE id_respuesta = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Pregunta no encontrada.' });
    return;
  }
  res.json({ ok: true });
});

// --- EXPLORADOR DE ENTREGABLES LARAVEL ---
apiRouter.get('/laravel-files', requireAuth, (_req, res) => {
  const baseDir = path.resolve(process.cwd(), 'laravel-app');
  if (!fs.existsSync(baseDir)) {
    res.json({ files: [] });
    return;
  }

  const collected: Array<{ path: string; content: string }> = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const rel = path.relative(baseDir, full).replace(/\\/g, '/');
        collected.push({
          path: rel,
          content: fs.readFileSync(full, 'utf8'),
        });
      }
    }
  }
  walk(baseDir);
  collected.sort((a, b) => a.path.localeCompare(b.path));
  res.json({ files: collected });
});

// --- COMPETENCIAS EN LÍNEA (DUELOS 1 VS 1) ---
apiRouter.get('/duelos/historial', requireAuth, (req: AuthedRequest, res) => {
  const duelos = listUserDuelHistory(req.user!.id_usuario);
  res.json({ duelos });
});

apiRouter.post('/duelos/crear', requireAuth, (req: AuthedRequest, res) => {
  const idSaber = Number(req.body?.id_saber);
  if (!Number.isInteger(idSaber) || idSaber <= 0) {
    res.status(400).json({ error: 'Selecciona un saber válido para crear la sala de competencia.' });
    return;
  }

  const result = createDuelRoom(idSaber, req.user!.id_usuario);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(201).json({ room: result.room });
});

apiRouter.post('/duelos/unirse', requireAuth, (req: AuthedRequest, res) => {
  const codigo = typeof req.body?.codigo === 'string' ? req.body.codigo : '';
  const result = joinDuelRoom(codigo, req.user!.id_usuario);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({ room: result.room });
});

apiRouter.get('/duelos/:codigo', requireAuth, (req: AuthedRequest, res) => {
  const codigo = typeof req.params.codigo === 'string' ? req.params.codigo : '';
  const room = getRoomSnapshot(codigo, req.user!.id_usuario);
  if (!room) {
    res.status(404).json({ error: 'Sala no encontrada o no perteneces a esta competencia.' });
    return;
  }

  res.json({ room });
});

apiRouter.post('/duelos/:codigo/responder', requireAuth, (req: AuthedRequest, res) => {
  const codigo = typeof req.params.codigo === 'string' ? req.params.codigo : '';
  const idRespuesta = Number(req.body?.id_respuesta);
  const opcion = typeof req.body?.opcion === 'string' ? req.body.opcion : '';

  if (!Number.isInteger(idRespuesta) || idRespuesta <= 0) {
    res.status(400).json({ error: 'Pregunta inválida.' });
    return;
  }

  const result = submitDuelAnswer({
    codigo,
    idUsuario: req.user!.id_usuario,
    idRespuesta,
    opcion,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({ room: result.room, finished_now: result.finishedNow });
});

apiRouter.get('/admin/auth-audit', requireRole('Administrador'), (_req, res) => {
  res.json({ events: listAuthAuditEvents(100) });
});

apiRouter.get('/admin/reportes-actividad', requireRole('Administrador'), (req, res) => {
  const periodoRaw = typeof req.query.periodo === 'string' ? req.query.periodo.trim() : '30d';
  const periodo: ReportPeriodPreset = ['7d', '30d', '90d', 'all'].includes(periodoRaw)
    ? (periodoRaw as ReportPeriodPreset)
    : '30d';

  const granRaw = typeof req.query.granularidad === 'string' ? req.query.granularidad.trim() : 'diaria';
  const granularidad: ReportGranularity = ['diaria', 'semanal', 'mensual'].includes(granRaw)
    ? (granRaw as ReportGranularity)
    : 'diaria';

  const idRolRaw = req.query.id_rol ? Number(req.query.id_rol) : null;
  const idRol = idRolRaw && Number.isInteger(idRolRaw) && idRolRaw > 0 ? idRolRaw : 'all';

  const idGradoRaw = req.query.id_grado ? Number(req.query.id_grado) : null;
  const idGrado = idGradoRaw && Number.isInteger(idGradoRaw) && idGradoRaw > 0 ? idGradoRaw : 'all';

  const estadoRaw = typeof req.query.estado_actividad === 'string' ? req.query.estado_actividad.trim() : 'all';
  const estadoActividad: ActivityIntensity | 'all' = [
    'power',
    'regular',
    'esporadico',
    'inactivo',
  ].includes(estadoRaw)
    ? (estadoRaw as ActivityIntensity)
    : 'all';

  const desde = typeof req.query.desde === 'string' ? req.query.desde.trim() : null;
  const hasta = typeof req.query.hasta === 'string' ? req.query.hasta.trim() : null;

  const report = buildAdminActivityReport({
    periodo,
    granularidad,
    idRol,
    idGrado,
    estadoActividad,
    desde,
    hasta,
  });

  res.json(report);
});

apiRouter.get('/admin/telemetria/estado', requireRole('Administrador'), (_req, res) => {
  res.json(getTelemetryControlReport());
});

apiRouter.post('/telemetria/eventos', (req: AuthedRequest, res) => {
  const body = req.body;
  const rawList: TelemetryEventInput[] = Array.isArray(body?.events)
    ? body.events
    : body && typeof body === 'object' && body.event_id
      ? [body as TelemetryEventInput]
      : [];

  if (rawList.length === 0) {
    res.status(400).json({ error: 'Se requiere al menos un evento válido en el arreglo events.' });
    return;
  }

  if (rawList.length > 50) {
    res.status(400).json({ error: 'El lote de telemetría no puede superar 50 eventos por solicitud.' });
    return;
  }

  const forcedActor = req.user
    ? { userId: req.user.id_usuario, role: req.user.nombre_rol }
    : null;

  const result = ingestTelemetryBatchSync(rawList, forcedActor);
  res.status(202).json(result);
});

// --- HISTORIAL Y REPORTES DE TIEMPO DE SESIÓN ---
apiRouter.post('/tiempo/heartbeat', requireAuth, (req: AuthedRequest, res) => {
  const result = upsertSessionActivity({
    userId: req.user!.id_usuario,
    sessionKey: typeof req.body?.session_key === 'string' ? req.body.session_key : '',
    startedAtMs: typeof req.body?.started_at_ms === 'number' ? req.body.started_at_ms : undefined,
    activeMs: typeof req.body?.active_ms === 'number' ? req.body.active_ms : 0,
    pausedMs: typeof req.body?.paused_ms === 'number' ? req.body.paused_ms : 0,
    state: typeof req.body?.state === 'string' ? req.body.state : 'activa',
    clientDate: typeof req.body?.fecha_dia === 'string' ? req.body.fecha_dia : undefined,
    final: false,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({ ok: true, session: result.session });
});

apiRouter.post('/tiempo/finalizar', requireAuth, (req: AuthedRequest, res) => {
  const result = upsertSessionActivity({
    userId: req.user!.id_usuario,
    sessionKey: typeof req.body?.session_key === 'string' ? req.body.session_key : '',
    startedAtMs: typeof req.body?.started_at_ms === 'number' ? req.body.started_at_ms : undefined,
    activeMs: typeof req.body?.active_ms === 'number' ? req.body.active_ms : 0,
    pausedMs: typeof req.body?.paused_ms === 'number' ? req.body.paused_ms : 0,
    state: 'finalizada',
    clientDate: typeof req.body?.fecha_dia === 'string' ? req.body.fecha_dia : undefined,
    final: true,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({ ok: true, session: result.session });
});

apiRouter.get('/tiempo/historial', requireAuth, (req: AuthedRequest, res) => {
  const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined;
  const hasta = typeof req.query.hasta === 'string' ? req.query.hasta : undefined;
  const rawTarget = req.query.id_usuario ? Number(req.query.id_usuario) : null;
  const targetUserId = rawTarget && Number.isInteger(rawTarget) && rawTarget > 0 ? rawTarget : null;

  const report = getTimeReport({
    requester: req.user!,
    desde,
    hasta,
    targetUserId,
  });

  res.json(report);
});

// --- REPORTES PEDAGÓGICOS PARA DOCENTES ---
apiRouter.get(
  '/profesor/reportes',
  requireRole('Profesor', 'Administrador'),
  (req: AuthedRequest, res) => {
    const rawGrado = typeof req.query.id_grado === 'string' ? req.query.id_grado.trim() : '';
    let filtroGradoId: number | null = null;
    if (rawGrado === 'todos') {
      filtroGradoId = null;
    } else if (rawGrado) {
      const parsed = Number(rawGrado);
      if (Number.isInteger(parsed) && parsed > 0) filtroGradoId = parsed;
    } else if (req.user?.id_grado) {
      filtroGradoId = req.user.id_grado;
    }

    const report = getTeacherAcademicReport({ filtroGradoId });
    res.json({
      filtro_grado_id: filtroGradoId,
      ...report,
    });
  }
);

apiRouter.get(
  '/profesor/reportes/estudiante/:id',
  requireRole('Profesor', 'Administrador'),
  (req, res) => {
    const idEstudiante = Number(req.params.id);
    if (!Number.isInteger(idEstudiante) || idEstudiante <= 0) {
      res.status(400).json({ error: 'Identificador de estudiante inválido.' });
      return;
    }

    const report = getPrivateStudentReport({ idEstudiante });
    if (!report) {
      res.status(404).json({ error: 'Estudiante no encontrado.' });
      return;
    }

    res.json(report);
  }
);

// --- SALAS VIRTUALES EN VIVO (WEBRTC + WEBSOCKETS) ---
apiRouter.get('/salas', requireAuth, (_req, res) => {
  res.json({ salas: listActiveVirtualRooms() });
});

apiRouter.post('/salas', requireAuth, (req: AuthedRequest, res) => {
  const result = createVirtualRoom({
    nombre: typeof req.body?.nombre === 'string' ? req.body.nombre : '',
    descripcion: typeof req.body?.descripcion === 'string' ? req.body.descripcion : null,
    idSaber:
      req.body?.id_saber !== undefined && req.body?.id_saber !== null && req.body?.id_saber !== ''
        ? Number(req.body.id_saber)
        : null,
    idCreador: req.user!.id_usuario,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(201).json({ room: result.room });
});

apiRouter.get('/salas/:codigo', requireAuth, (req, res) => {
  const codigo = typeof req.params.codigo === 'string' ? req.params.codigo : '';
  const detail = getVirtualRoomDetails(codigo);
  if (!detail) {
    res.status(404).json({ error: 'Sala virtual no encontrada.' });
    return;
  }

  res.json({ room: detail });
});

apiRouter.post('/salas/:codigo/cerrar', requireAuth, (req: AuthedRequest, res) => {
  const codigo = typeof req.params.codigo === 'string' ? req.params.codigo : '';
  const result = closeVirtualRoom({
    codigo,
    requesterId: req.user!.id_usuario,
    requesterRole: req.user!.nombre_rol,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({ ok: true });
});

// --- ENCUESTAS ANALÍTICAS Y REPORTES ESTADÍSTICOS ---
apiRouter.get('/encuestas-analiticas', requireAuth, (_req, res) => {
  res.json({ encuestas: listSurveyDefinitions() });
});

apiRouter.post('/encuestas-analiticas', requireRole('Administrador'), (req, res) => {
  const result = createSurveyDefinition({
    codigo: req.body?.codigo,
    titulo: req.body?.titulo,
    descripcion: req.body?.descripcion,
    activa: req.body?.activa,
    preguntas: req.body?.preguntas,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(201).json({ encuesta: result.survey });
});

apiRouter.get('/encuestas-analiticas/:id', requireAuth, (req: AuthedRequest, res) => {
  const idEncuesta = Number(req.params.id);
  if (!Number.isInteger(idEncuesta) || idEncuesta <= 0) {
    res.status(400).json({ error: 'Identificador de encuesta inválido.' });
    return;
  }

  const survey = getSurveyDefinitionById(idEncuesta, req.user!.id_usuario);
  if (!survey) {
    res.status(404).json({ error: 'Encuesta no encontrada.' });
    return;
  }

  res.json({ encuesta: survey });
});

apiRouter.post('/encuestas-analiticas/:id/respuestas', requireAuth, (req: AuthedRequest, res) => {
  const idEncuesta = Number(req.params.id);
  if (!Number.isInteger(idEncuesta) || idEncuesta <= 0) {
    res.status(400).json({ error: 'Identificador de encuesta inválido.' });
    return;
  }

  const result = submitSurveyResponses({
    idEncuestaDef: idEncuesta,
    idUsuario: req.user!.id_usuario,
    respuestas: req.body?.respuestas,
    enviadoEnUtc: typeof req.body?.enviado_en_utc === 'string' ? req.body.enviado_en_utc : undefined,
  });

  if (!result.ok) {
    res.status(result.status).json({
      error: result.error,
      ...(result.code ? { code: result.code } : {}),
      ...(result.enviado_en_utc ? { enviado_en_utc: result.enviado_en_utc } : {}),
    });
    return;
  }

  res.status(201).json({ ok: true, envio: result.envio });
});

apiRouter.get(
  '/encuestas-analiticas/:id/reporte',
  requireRole('Administrador', 'Profesor'),
  (req, res) => {
    const idEncuesta = Number(req.params.id);
    if (!Number.isInteger(idEncuesta) || idEncuesta <= 0) {
      res.status(400).json({ error: 'Identificador de encuesta inválido.' });
      return;
    }

    const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined;
    const hasta = typeof req.query.hasta === 'string' ? req.query.hasta : undefined;
    const tipo = typeof req.query.tipo === 'string' ? (req.query.tipo as SurveyQuestionType) : undefined;

    const result = getSurveyStatisticalReport(idEncuesta, { desde, hasta, tipo });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result.reporte);
  }
);
