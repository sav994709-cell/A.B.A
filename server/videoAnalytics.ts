import crypto from 'node:crypto';
import { db } from './db.ts';

export interface RecordVideoViewInput {
  idUsuario: number;
  idVideo: number;
  sessionViewId?: string | null;
  duracionVistaSegundos?: number;
  posicionMaxSegundos?: number;
  completado?: boolean;
  fechaVisualizacionUtc?: string;
}

export interface RecordedVideoView {
  id_visualizacion: number;
  id_usuario: number;
  id_video: number;
  session_view_id: string;
  fecha_visualizacion_utc: string;
  utc_date: string;
  duracion_vista_segundos: number;
  posicion_max_segundos: number;
  duracion_video_segundos: number;
  completado: boolean;
  actualizado_en_utc: string;
}

export type RecordVideoViewResult =
  | { ok: true; visualizacion: RecordedVideoView; deduplicado: boolean }
  | { ok: false; error: string; status: 400 | 404 };

const DEDUP_WINDOW_MS = 60_000;

function parseUtcTimestamp(raw?: string): { ok: true; isoUtc: string; utcDate: string } | { ok: false; error: string } {
  if (!raw) {
    const isoUtc = new Date().toISOString();
    return { ok: true, isoUtc, utcDate: isoUtc.slice(0, 10) };
  }
  const trimmed = raw.trim();
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
    return { ok: false, error: 'fecha_visualizacion_utc debe incluir zona horaria explícita (Z o ±HH:MM).' };
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: 'fecha_visualizacion_utc inválida.' };
  }
  const isoUtc = new Date(parsed).toISOString();
  return { ok: true, isoUtc, utcDate: isoUtc.slice(0, 10) };
}

export function recordVideoView(input: RecordVideoViewInput): RecordVideoViewResult {
  if (!Number.isInteger(input.idVideo) || input.idVideo <= 0) {
    return { ok: false, error: 'Video educativo no encontrado.', status: 404 };
  }

  const videoRow = db
    .prepare('SELECT id_video, duracion_segundos FROM video WHERE id_video = ?')
    .get(input.idVideo) as { id_video: number; duracion_segundos: number | null } | undefined;

  if (!videoRow) {
    return { ok: false, error: 'Video educativo no encontrado.', status: 404 };
  }

  const ts = parseUtcTimestamp(input.fechaVisualizacionUtc);
  if (!ts.ok) {
    return { ok: false, error: ts.error, status: 400 };
  }

  const duracionVideo = Math.max(0, Math.round(videoRow.duracion_segundos ?? 180));
  const rawWatched = input.duracionVistaSegundos ?? 0;
  const rawPos = input.posicionMaxSegundos ?? 0;

  if (!Number.isFinite(rawWatched) || rawWatched < 0 || !Number.isFinite(rawPos) || rawPos < 0) {
    return { ok: false, error: 'Los tiempos de visualización deben ser números positivos o cero.', status: 400 };
  }

  // Acotar valores atípicos para no distorsionar estadísticas acumuladas
  const maxAllowedDuration = Math.max(duracionVideo * 2, 3600);
  const duracionVista = Math.min(maxAllowedDuration, Math.round(rawWatched));
  const posicionMax = duracionVideo > 0 ? Math.min(duracionVideo, Math.round(rawPos)) : Math.round(rawPos);
  const completadoFlag =
    Boolean(input.completado) || (duracionVideo > 0 && posicionMax >= Math.floor(duracionVideo * 0.9)) ? 1 : 0;

  let sessionViewId = typeof input.sessionViewId === 'string' ? input.sessionViewId.trim().slice(0, 80) : '';

  if (!sessionViewId) {
    // Protección contra duplicados accidentales al recargar o disparar doble petición sin session_view_id
    const recent = db
      .prepare(
        `SELECT session_view_id, actualizado_en_utc
         FROM video_visualizacion
         WHERE id_usuario = ? AND id_video = ?
         ORDER BY actualizado_en_utc DESC, id_visualizacion DESC
         LIMIT 1`
      )
      .get(input.idUsuario, input.idVideo) as
      | { session_view_id: string; actualizado_en_utc: string }
      | undefined;

    if (recent) {
      const recentMs = Date.parse(recent.actualizado_en_utc);
      const currentMs = Date.parse(ts.isoUtc);
      if (Number.isFinite(recentMs) && Math.abs(currentMs - recentMs) <= DEDUP_WINDOW_MS) {
        sessionViewId = recent.session_view_id;
      }
    }
    if (!sessionViewId) {
      sessionViewId = `srv-${crypto.randomUUID()}`;
    }
  }

  const existingBefore = db
    .prepare(
      'SELECT id_visualizacion FROM video_visualizacion WHERE id_usuario = ? AND id_video = ? AND session_view_id = ?'
    )
    .get(input.idUsuario, input.idVideo, sessionViewId) as { id_visualizacion: number } | undefined;

  const nowIso = new Date().toISOString();

  db.prepare(
    `INSERT INTO video_visualizacion (
       id_usuario, id_video, session_view_id, fecha_visualizacion_utc, utc_date,
       duracion_vista_segundos, posicion_max_segundos, duracion_video_segundos, completado, actualizado_en_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id_usuario, id_video, session_view_id) DO UPDATE SET
       duracion_vista_segundos = MAX(video_visualizacion.duracion_vista_segundos, excluded.duracion_vista_segundos),
       posicion_max_segundos = MAX(video_visualizacion.posicion_max_segundos, excluded.posicion_max_segundos),
       duracion_video_segundos = MAX(video_visualizacion.duracion_video_segundos, excluded.duracion_video_segundos),
       completado = MAX(video_visualizacion.completado, excluded.completado),
       actualizado_en_utc = excluded.actualizado_en_utc`
  ).run(
    input.idUsuario,
    input.idVideo,
    sessionViewId,
    ts.isoUtc,
    ts.utcDate,
    duracionVista,
    posicionMax,
    duracionVideo,
    completadoFlag,
    nowIso
  );

  const saved = db
    .prepare(
      `SELECT id_visualizacion, id_usuario, id_video, session_view_id, fecha_visualizacion_utc, utc_date,
              duracion_vista_segundos, posicion_max_segundos, duracion_video_segundos, completado, actualizado_en_utc
       FROM video_visualizacion
       WHERE id_usuario = ? AND id_video = ? AND session_view_id = ?`
    )
    .get(input.idUsuario, input.idVideo, sessionViewId) as {
    id_visualizacion: number;
    id_usuario: number;
    id_video: number;
    session_view_id: string;
    fecha_visualizacion_utc: string;
    utc_date: string;
    duracion_vista_segundos: number;
    posicion_max_segundos: number;
    duracion_video_segundos: number;
    completado: number;
    actualizado_en_utc: string;
  };

  return {
    ok: true,
    deduplicado: Boolean(existingBefore),
    visualizacion: {
      ...saved,
      completado: Boolean(saved.completado),
    },
  };
}

export interface VideoLearningStats {
  periodo: {
    desde: string | null;
    hasta: string | null;
  };
  resumen: {
    videos_unicos_vistos: number;
    videos_completados: number;
    total_sesiones_visualizacion: number;
    total_videos_catalogo: number;
    progreso_catalogo_pct: number;
    tiempo_acumulado_segundos: number;
    tiempo_acumulado_minutos: number;
    dias_activos: number;
    primera_visualizacion_utc: string | null;
    ultima_visualizacion_utc: string | null;
  };
  progreso_por_tema: Array<{
    id_saber: number;
    saber_titulo: string;
    nombre_grado: string;
    total_videos_tema: number;
    videos_vistos_tema: number;
    videos_completados_tema: number;
    progreso_pct: number;
    tiempo_acumulado_segundos: number;
  }>;
  frecuencia_actividad: Array<{
    utc_date: string;
    sesiones_visualizacion: number;
    videos_unicos_dia: number;
    videos_completados_dia: number;
    tiempo_acumulado_segundos: number;
  }>;
  historial_reciente: Array<{
    id_visualizacion: number;
    id_video: number;
    titulo: string;
    saber_titulo: string;
    fecha_visualizacion_utc: string;
    duracion_vista_segundos: number;
    completado: boolean;
  }>;
}

export function getUserVideoLearningStats(
  idUsuario: number,
  options?: { desde?: string; hasta?: string }
): VideoLearningStats {
  const desde = options?.desde && /^\d{4}-\d{2}-\d{2}$/.test(options.desde) ? options.desde : null;
  const hasta = options?.hasta && /^\d{4}-\d{2}-\d{2}$/.test(options.hasta) ? options.hasta : null;

  const dateFilters: string[] = ['vv.id_usuario = ?'];
  const params: Array<string | number> = [idUsuario];
  if (desde) {
    dateFilters.push('vv.utc_date >= ?');
    params.push(desde);
  }
  if (hasta) {
    dateFilters.push('vv.utc_date <= ?');
    params.push(hasta);
  }
  const whereClause = dateFilters.join(' AND ');

  const totalCatalogoRow = db.prepare('SELECT COUNT(*) as total FROM video').get() as { total: number };
  const totalCatalogo = totalCatalogoRow.total;

  const resumenRow = db
    .prepare(
      `SELECT
         COUNT(DISTINCT vv.id_video) as videos_unicos_vistos,
         COUNT(DISTINCT CASE WHEN vv.completado = 1 THEN vv.id_video END) as videos_completados,
         COUNT(*) as total_sesiones_visualizacion,
         COALESCE(SUM(vv.duracion_vista_segundos), 0) as tiempo_acumulado_segundos,
         COUNT(DISTINCT vv.utc_date) as dias_activos,
         MIN(vv.fecha_visualizacion_utc) as primera_visualizacion_utc,
         MAX(vv.fecha_visualizacion_utc) as ultima_visualizacion_utc
       FROM video_visualizacion vv
       INNER JOIN video v ON v.id_video = vv.id_video
       WHERE ${whereClause}`
    )
    .get(...params) as {
    videos_unicos_vistos: number;
    videos_completados: number;
    total_sesiones_visualizacion: number;
    tiempo_acumulado_segundos: number;
    dias_activos: number;
    primera_visualizacion_utc: string | null;
    ultima_visualizacion_utc: string | null;
  };

  const progresoPct =
    totalCatalogo > 0
      ? Math.round((resumenRow.videos_completados / totalCatalogo) * 1000) / 10
      : 0;

  // Progreso desagregado por saber/tema y grado
  const temaWhere: string[] = [];
  const temaParams: Array<string | number> = [idUsuario];
  if (desde) {
    temaWhere.push('vv.utc_date >= ?');
    temaParams.push(desde);
  }
  if (hasta) {
    temaWhere.push('vv.utc_date <= ?');
    temaParams.push(hasta);
  }
  const temaDateAnd = temaWhere.length > 0 ? `AND ${temaWhere.join(' AND ')}` : '';

  const temaRows = db
    .prepare(
      `SELECT
         s.id_saber,
         s.titulo as saber_titulo,
         g.nombre_grado,
         COUNT(DISTINCT v.id_video) as total_videos_tema,
         COUNT(DISTINCT vv.id_video) as videos_vistos_tema,
         COUNT(DISTINCT CASE WHEN vv.completado = 1 THEN vv.id_video END) as videos_completados_tema,
         COALESCE(SUM(vv.duracion_vista_segundos), 0) as tiempo_acumulado_segundos
       FROM saber s
       INNER JOIN grado g ON g.id_grado = s.id_grado
       INNER JOIN video v ON v.id_saber = s.id_saber
       LEFT JOIN video_visualizacion vv
         ON vv.id_video = v.id_video
         AND vv.id_usuario = ?
         ${temaDateAnd}
       GROUP BY s.id_saber, s.titulo, g.nombre_grado
       ORDER BY g.id_grado ASC, s.id_saber ASC`
    )
    .all(...temaParams) as Array<{
    id_saber: number;
    saber_titulo: string;
    nombre_grado: string;
    total_videos_tema: number;
    videos_vistos_tema: number;
    videos_completados_tema: number;
    tiempo_acumulado_segundos: number;
  }>;

  const progresoPorTema = temaRows.map((row) => ({
    ...row,
    progreso_pct:
      row.total_videos_tema > 0
        ? Math.round((row.videos_completados_tema / row.total_videos_tema) * 1000) / 10
        : 0,
  }));

  const frecuenciaRows = db
    .prepare(
      `SELECT
         vv.utc_date,
         COUNT(*) as sesiones_visualizacion,
         COUNT(DISTINCT vv.id_video) as videos_unicos_dia,
         COUNT(DISTINCT CASE WHEN vv.completado = 1 THEN vv.id_video END) as videos_completados_dia,
         COALESCE(SUM(vv.duracion_vista_segundos), 0) as tiempo_acumulado_segundos
       FROM video_visualizacion vv
       INNER JOIN video v ON v.id_video = vv.id_video
       WHERE ${whereClause}
       GROUP BY vv.utc_date
       ORDER BY vv.utc_date DESC
       LIMIT 60`
    )
    .all(...params) as Array<{
    utc_date: string;
    sesiones_visualizacion: number;
    videos_unicos_dia: number;
    videos_completados_dia: number;
    tiempo_acumulado_segundos: number;
  }>;

  const historialRows = db
    .prepare(
      `SELECT
         vv.id_visualizacion,
         vv.id_video,
         v.titulo,
         s.titulo as saber_titulo,
         vv.fecha_visualizacion_utc,
         vv.duracion_vista_segundos,
         vv.completado
       FROM video_visualizacion vv
       INNER JOIN video v ON v.id_video = vv.id_video
       INNER JOIN saber s ON s.id_saber = v.id_saber
       WHERE ${whereClause}
       ORDER BY vv.fecha_visualizacion_utc DESC, vv.id_visualizacion DESC
       LIMIT 25`
    )
    .all(...params) as Array<{
    id_visualizacion: number;
    id_video: number;
    titulo: string;
    saber_titulo: string;
    fecha_visualizacion_utc: string;
    duracion_vista_segundos: number;
    completado: number;
  }>;

  return {
    periodo: { desde, hasta },
    resumen: {
      videos_unicos_vistos: resumenRow.videos_unicos_vistos,
      videos_completados: resumenRow.videos_completados,
      total_sesiones_visualizacion: resumenRow.total_sesiones_visualizacion,
      total_videos_catalogo: totalCatalogo,
      progreso_catalogo_pct: progresoPct,
      tiempo_acumulado_segundos: resumenRow.tiempo_acumulado_segundos,
      tiempo_acumulado_minutos: Math.round((resumenRow.tiempo_acumulado_segundos / 60) * 10) / 10,
      dias_activos: resumenRow.dias_activos,
      primera_visualizacion_utc: resumenRow.primera_visualizacion_utc,
      ultima_visualizacion_utc: resumenRow.ultima_visualizacion_utc,
    },
    progreso_por_tema: progresoPorTema,
    frecuencia_actividad: frecuenciaRows,
    historial_reciente: historialRows.map((h) => ({
      ...h,
      completado: Boolean(h.completado),
    })),
  };
}
