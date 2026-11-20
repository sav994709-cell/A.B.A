import { db } from './db.ts';

export interface RecordedScore {
  id_puntaje: number;
  id_usuario: number;
  id_estudiante: number | null;
  id_evaluacion: number;
  calificacion: number;
  fecha_realizacion: string;
}

export interface LeaderboardEntry {
  id_puntaje: number;
  id_usuario: number;
  nombre_usuario: string;
  calificacion: number;
  fecha_realizacion: string;
  posicion: number;
  es_usuario_actual: boolean;
}

export function recordEvaluationScore(params: {
  idUsuario: number;
  idEstudiante: number | null;
  idEvaluacion: number;
  calificacion: number;
  fechaRealizacion?: string;
}): RecordedScore {
  const fecha = params.fechaRealizacion ?? new Date().toISOString().slice(0, 19).replace('T', ' ');
  const info = db
    .prepare(
      'INSERT INTO puntaje (id_usuario, id_estudiante, id_evaluacion, calificacion, fecha_realizacion) VALUES (?, ?, ?, ?, ?)'
    )
    .run(params.idUsuario, params.idEstudiante, params.idEvaluacion, params.calificacion, fecha);

  return {
    id_puntaje: Number(info.lastInsertRowid),
    id_usuario: params.idUsuario,
    id_estudiante: params.idEstudiante,
    id_evaluacion: params.idEvaluacion,
    calificacion: params.calificacion,
    fecha_realizacion: fecha,
  };
}

export function getEvaluationLeaderboard(
  idEvaluacion: number,
  currentUserId?: number
): LeaderboardEntry[] {
  const rows = db
    .prepare(
      `SELECT
         p.id_puntaje,
         p.id_usuario,
         TRIM(u.nombre || ' ' || u.apellido) AS nombre_usuario,
         p.calificacion,
         p.fecha_realizacion,
         RANK() OVER (ORDER BY p.calificacion DESC) AS posicion
       FROM puntaje p
       JOIN usuario u ON u.id_usuario = p.id_usuario
       WHERE p.id_evaluacion = ?
       ORDER BY p.calificacion DESC, p.fecha_realizacion ASC, p.id_puntaje ASC`
    )
    .all(idEvaluacion) as Array<{
    id_puntaje: number;
    id_usuario: number;
    nombre_usuario: string;
    calificacion: number;
    fecha_realizacion: string;
    posicion: number;
  }>;

  return rows.map((row) => ({
    id_puntaje: Number(row.id_puntaje),
    id_usuario: Number(row.id_usuario),
    nombre_usuario: row.nombre_usuario,
    calificacion: Number(row.calificacion),
    fecha_realizacion: row.fecha_realizacion,
    posicion: Number(row.posicion),
    es_usuario_actual: currentUserId !== undefined && Number(row.id_usuario) === currentUserId,
  }));
}
