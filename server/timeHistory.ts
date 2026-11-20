import type { AuthUser } from './auth.ts';
import { db } from './db.ts';

export type SessionActivityState = 'activa' | 'pausada' | 'finalizada';

export interface SessionActivityRow {
  id_sesion: number;
  id_usuario: number;
  usuario_nombre: string;
  usuario_email: string;
  nombre_rol: string;
  fecha_dia: string;
  inicio_ms: number;
  fin_ms: number;
  duracion_activa_ms: number;
  pausas_ms: number;
  estado: SessionActivityState;
}

export interface DailyTimeStat {
  fecha_dia: string;
  sesiones: number;
  duracion_activa_ms: number;
  pausas_ms: number;
}

export interface UserTimeSummary {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  nombre_rol: string;
  sesiones: number;
  tiempo_total_activo_ms: number;
  tiempo_pausado_ms: number;
  tiempo_promedio_ms: number;
  ultima_conexion_ms: number;
}

export interface TimeReportResponse {
  es_admin: boolean;
  filtro_usuario_id: number | null;
  desde: string | null;
  hasta: string | null;
  estadisticas: {
    total_sesiones: number;
    tiempo_total_activo_ms: number;
    tiempo_promedio_sesion_ms: number;
    tiempo_pausado_ms: number;
    dias_activos: number;
    porcentaje_actividad: number;
    fecha_pico: string | null;
    serie_diaria: DailyTimeStat[];
  };
  sesiones: SessionActivityRow[];
  usuarios_resumen?: UserTimeSummary[];
  usuarios_filtro?: Array<{
    id_usuario: number;
    nombre: string;
    apellido: string;
    email: string;
    nombre_rol: string;
  }>;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(epochMs: number): string {
  const d = new Date(epochMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function upsertSessionActivity(params: {
  userId: number;
  sessionKey: string;
  startedAtMs?: number;
  activeMs?: number;
  pausedMs?: number;
  state?: string;
  clientDate?: string;
  final?: boolean;
}):
  | { ok: true; session: { id_sesion: number; duracion_activa_ms: number; pausas_ms: number; estado: SessionActivityState } }
  | { ok: false; status: number; error: string } {
  const sessionKey = typeof params.sessionKey === 'string' ? params.sessionKey.trim() : '';
  if (!sessionKey || sessionKey.length > 100) {
    return { ok: false, status: 400, error: 'Identificador de sesión inválido.' };
  }

  const now = Date.now();
  const maxPastWindow = 30 * 24 * 60 * 60 * 1000;
  const rawStart = Number(params.startedAtMs);
  const inicioMs =
    Number.isFinite(rawStart) && rawStart > now - maxPastWindow && rawStart <= now
      ? Math.round(rawStart)
      : now;

  const finMs = now;
  const maxWallElapsed = Math.max(0, finMs - inicioMs) + 5_000;
  const rawActive = Number(params.activeMs);
  const duracionActiva =
    Number.isFinite(rawActive) && rawActive >= 0
      ? Math.min(Math.round(rawActive), maxWallElapsed)
      : 0;

  const rawPaused = Number(params.pausedMs);
  const pausasMs =
    Number.isFinite(rawPaused) && rawPaused >= 0
      ? Math.min(Math.round(rawPaused), maxWallElapsed)
      : 0;

  const estado: SessionActivityState = params.final
    ? 'finalizada'
    : params.state === 'pausada'
      ? 'pausada'
      : 'activa';

  const fechaDia =
    typeof params.clientDate === 'string' && DATE_REGEX.test(params.clientDate.trim())
      ? params.clientDate.trim()
      : toIsoDateString(inicioMs);

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const existing = db
      .prepare(
        'SELECT id_sesion, id_usuario, inicio_ms, fin_ms, duracion_activa_ms, pausas_ms FROM sesion_actividad WHERE session_key = ?'
      )
      .get(sessionKey) as
      | {
          id_sesion: number;
          id_usuario: number;
          inicio_ms: number;
          fin_ms: number;
          duracion_activa_ms: number;
          pausas_ms: number;
        }
      | undefined;

    if (existing) {
      if (existing.id_usuario !== params.userId) {
        db.exec('ROLLBACK;');
        return { ok: false, status: 403, error: 'La sesión de actividad pertenece a otro usuario.' };
      }

      const maxSinceExistingStart = Math.max(0, finMs - existing.inicio_ms) + 5_000;
      const mergedActive = Math.min(
        Math.max(existing.duracion_activa_ms, duracionActiva),
        maxSinceExistingStart
      );
      const mergedPaused = Math.min(
        Math.max(existing.pausas_ms, pausasMs),
        maxSinceExistingStart
      );
      const mergedFin = Math.max(existing.fin_ms, finMs);

      db.prepare(
        `UPDATE sesion_actividad
         SET fin_ms = ?, duracion_activa_ms = ?, pausas_ms = ?, estado = ?, ultimo_latido_ms = ?
         WHERE id_sesion = ?`
      ).run(mergedFin, mergedActive, mergedPaused, estado, now, existing.id_sesion);

      db.exec('COMMIT;');
      return {
        ok: true,
        session: {
          id_sesion: existing.id_sesion,
          duracion_activa_ms: mergedActive,
          pausas_ms: mergedPaused,
          estado,
        },
      };
    }

    const info = db
      .prepare(
        `INSERT INTO sesion_actividad
         (id_usuario, session_key, fecha_dia, inicio_ms, fin_ms, duracion_activa_ms, pausas_ms, estado, ultimo_latido_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(params.userId, sessionKey, fechaDia, inicioMs, finMs, duracionActiva, pausasMs, estado, now);

    db.exec('COMMIT;');
    return {
      ok: true,
      session: {
        id_sesion: Number(info.lastInsertRowid),
        duracion_activa_ms: duracionActiva,
        pausas_ms: pausasMs,
        estado,
      },
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }
}

export function getTimeReport(params: {
  requester: AuthUser;
  desde?: string;
  hasta?: string;
  targetUserId?: number | null;
}): TimeReportResponse {
  const isAdmin = params.requester.nombre_rol === 'Administrador';
  const desde =
    typeof params.desde === 'string' && DATE_REGEX.test(params.desde.trim())
      ? params.desde.trim()
      : null;
  const hasta =
    typeof params.hasta === 'string' && DATE_REGEX.test(params.hasta.trim())
      ? params.hasta.trim()
      : null;

  // Regla de privacidad: un usuario no administrador solo puede consultar su propio historial
  const filterUserId = isAdmin
    ? params.targetUserId && Number.isInteger(params.targetUserId) && params.targetUserId > 0
      ? params.targetUserId
      : null
    : params.requester.id_usuario;

  const whereClauses: string[] = ['1=1'];
  const sqlParams: Array<string | number> = [];

  if (filterUserId !== null) {
    whereClauses.push('sa.id_usuario = ?');
    sqlParams.push(filterUserId);
  }
  if (desde !== null) {
    whereClauses.push('sa.fecha_dia >= ?');
    sqlParams.push(desde);
  }
  if (hasta !== null) {
    whereClauses.push('sa.fecha_dia <= ?');
    sqlParams.push(hasta);
  }

  const whereSql = whereClauses.join(' AND ');

  const allMatching = db
    .prepare(
      `SELECT sa.id_sesion, sa.id_usuario,
              (u.nombre || ' ' || u.apellido) as usuario_nombre,
              u.email as usuario_email,
              r.nombre_rol,
              sa.fecha_dia, sa.inicio_ms, sa.fin_ms,
              sa.duracion_activa_ms, sa.pausas_ms, sa.estado
       FROM sesion_actividad sa
       JOIN usuario u ON u.id_usuario = sa.id_usuario
       JOIN rol r ON r.id_rol = u.id_rol
       WHERE ${whereSql}
       ORDER BY sa.inicio_ms DESC, sa.id_sesion DESC`
    )
    .all(...sqlParams) as unknown as SessionActivityRow[];

  let tiempoTotalActivoMs = 0;
  let tiempoPausadoMs = 0;
  const dailyMap = new Map<string, DailyTimeStat>();

  for (const s of allMatching) {
    const activo = Number(s.duracion_activa_ms) || 0;
    const pausa = Number(s.pausas_ms) || 0;
    tiempoTotalActivoMs += activo;
    tiempoPausadoMs += pausa;

    const currentDay = dailyMap.get(s.fecha_dia) ?? {
      fecha_dia: s.fecha_dia,
      sesiones: 0,
      duracion_activa_ms: 0,
      pausas_ms: 0,
    };
    currentDay.sesiones += 1;
    currentDay.duracion_activa_ms += activo;
    currentDay.pausas_ms += pausa;
    dailyMap.set(s.fecha_dia, currentDay);
  }

  const serieDiaria = Array.from(dailyMap.values()).sort((a, b) =>
    a.fecha_dia.localeCompare(b.fecha_dia)
  );

  let fechaPico: string | null = null;
  let maxDayMs = -1;
  for (const d of serieDiaria) {
    if (d.duracion_activa_ms > maxDayMs) {
      maxDayMs = d.duracion_activa_ms;
      fechaPico = d.fecha_dia;
    }
  }

  const totalSesiones = allMatching.length;
  const tiempoPromedioSesionMs =
    totalSesiones > 0 ? Math.round(tiempoTotalActivoMs / totalSesiones) : 0;
  const totalMonitoreado = tiempoTotalActivoMs + tiempoPausadoMs;
  const porcentajeActividad =
    totalMonitoreado > 0
      ? Number(((tiempoTotalActivoMs / totalMonitoreado) * 100).toFixed(1))
      : 100;

  const response: TimeReportResponse = {
    es_admin: isAdmin,
    filtro_usuario_id: filterUserId,
    desde,
    hasta,
    estadisticas: {
      total_sesiones: totalSesiones,
      tiempo_total_activo_ms: tiempoTotalActivoMs,
      tiempo_promedio_sesion_ms: tiempoPromedioSesionMs,
      tiempo_pausado_ms: tiempoPausadoMs,
      dias_activos: serieDiaria.length,
      porcentaje_actividad: porcentajeActividad,
      fecha_pico: fechaPico,
      serie_diaria: serieDiaria,
    },
    sesiones: allMatching.slice(0, 200),
  };

  if (isAdmin) {
    const adminWhere: string[] = ['1=1'];
    const adminParams: Array<string | number> = [];
    if (desde !== null) {
      adminWhere.push('sa.fecha_dia >= ?');
      adminParams.push(desde);
    }
    if (hasta !== null) {
      adminWhere.push('sa.fecha_dia <= ?');
      adminParams.push(hasta);
    }

    const userAggRows = db
      .prepare(
        `SELECT u.id_usuario, u.nombre, u.apellido, u.email, r.nombre_rol,
                COUNT(sa.id_sesion) as sesiones,
                COALESCE(SUM(sa.duracion_activa_ms), 0) as tiempo_total_activo_ms,
                COALESCE(SUM(sa.pausas_ms), 0) as tiempo_pausado_ms,
                COALESCE(MAX(sa.fin_ms), 0) as ultima_conexion_ms
         FROM usuario u
         JOIN rol r ON r.id_rol = u.id_rol
         JOIN sesion_actividad sa ON sa.id_usuario = u.id_usuario
         WHERE ${adminWhere.join(' AND ')}
         GROUP BY u.id_usuario
         ORDER BY tiempo_total_activo_ms DESC, sesiones DESC`
      )
      .all(...adminParams) as unknown as Array<Omit<UserTimeSummary, 'tiempo_promedio_ms'>>;

    response.usuarios_resumen = userAggRows.map((u) => ({
      ...u,
      tiempo_promedio_ms:
        u.sesiones > 0 ? Math.round(u.tiempo_total_activo_ms / u.sesiones) : 0,
    }));

    response.usuarios_filtro = db
      .prepare(
        `SELECT u.id_usuario, u.nombre, u.apellido, u.email, r.nombre_rol
         FROM usuario u
         JOIN rol r ON r.id_rol = u.id_rol
         ORDER BY u.nombre ASC, u.apellido ASC`
      )
      .all() as unknown as NonNullable<TimeReportResponse['usuarios_filtro']>;
  }

  return response;
}
