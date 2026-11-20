import crypto from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { db } from './db.ts';
import {
  getUserSessionVersion,
  loadUserProfile,
  parseCookies,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from './auth.ts';

export type DuelRoomStatus = 'esperando' | 'en_curso' | 'finalizada' | 'cancelada';

export interface DuelParticipantView {
  id_usuario: number;
  nombre_usuario: string;
  estado: 'conectado' | 'finalizado' | 'desconectado';
  en_linea: boolean;
  puntuacion: number;
  aciertos: number;
  respondidas: number;
  total_preguntas: number;
  tiempo_ms: number | null;
  es_usuario_actual: boolean;
}

export interface DuelQuestionView {
  orden: number;
  id_respuesta: number;
  enunciado_pregunta: string;
  opcion_a: string;
  opcion_b: string;
  opcion_c: string;
  mi_opcion: 'A' | 'B' | 'C' | null;
}

export interface DuelQuestionComparison {
  orden: number;
  id_respuesta: number;
  enunciado_pregunta: string;
  opcion_a: string;
  opcion_b: string;
  opcion_c: string;
  opcion_correcta: 'A' | 'B' | 'C';
  explicacion: string | null;
  respuestas_por_usuario: Record<
    number,
    {
      opcion_elegida: 'A' | 'B' | 'C';
      es_correcta: boolean;
    } | null
  >;
}

export interface DuelRoomSnapshot {
  id_sala: number;
  codigo: string;
  id_saber: number;
  saber_titulo: string;
  nombre_grado: string;
  id_creador: number;
  estado: DuelRoomStatus;
  creada_en: string;
  iniciada_en_ms: number | null;
  finalizada_en_ms: number | null;
  motivo_cierre: string | null;
  id_ganador: number | null;
  participantes: DuelParticipantView[];
  preguntas: DuelQuestionView[];
  comparacion: DuelQuestionComparison[] | null;
}

export interface DuelHistoryItem {
  id_sala: number;
  codigo: string;
  id_saber: number;
  saber_titulo: string;
  estado: DuelRoomStatus;
  creada_en: string;
  motivo_cierre: string | null;
  id_ganador: number | null;
  mi_puntuacion: number;
  mi_aciertos: number;
  total_preguntas: number;
  mi_tiempo_ms: number | null;
  oponente_nombre: string | null;
  oponente_puntuacion: number | null;
  oponente_aciertos: number | null;
  oponente_tiempo_ms: number | null;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 15; attempt++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    const exists = db.prepare('SELECT id_sala FROM competencia_sala WHERE codigo = ?').get(code);
    if (!exists) return code;
  }
  return `D${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

// Registro en memoria de conexiones WebSocket activas por sala y usuario
const roomSockets = new Map<string, Map<number, Set<WebSocket>>>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(codigo: string, idUsuario: number): string {
  return `${codigo}:${idUsuario}`;
}

function isUserOnlineInRoom(codigo: string, idUsuario: number): boolean {
  const userSet = roomSockets.get(codigo)?.get(idUsuario);
  if (!userSet) return false;
  for (const ws of userSet) {
    if (ws.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

function clearDisconnectTimer(codigo: string, idUsuario: number) {
  const key = timerKey(codigo, idUsuario);
  const existing = disconnectTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    disconnectTimers.delete(key);
  }
}

function clearAllRoomTimers(codigo: string) {
  const prefix = `${codigo}:`;
  for (const [key, timer] of disconnectTimers.entries()) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer);
      disconnectTimers.delete(key);
    }
  }
}

export function broadcastRoomState(codigo: string, eventType: 'duel:state' | 'duel:finished' = 'duel:state') {
  const roomMap = roomSockets.get(codigo);
  if (!roomMap) return;

  for (const [idUsuario, sockets] of roomMap.entries()) {
    const snapshot = getRoomSnapshot(codigo, idUsuario);
    if (!snapshot) continue;
    const payload = JSON.stringify({ type: eventType, room: snapshot });
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

function broadcastRoomNotice(codigo: string, payloadObj: Record<string, unknown>, excludeUserId?: number) {
  const roomMap = roomSockets.get(codigo);
  if (!roomMap) return;
  const payload = JSON.stringify(payloadObj);
  for (const [uid, sockets] of roomMap.entries()) {
    if (excludeUserId !== undefined && uid === excludeUserId) continue;
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

export function createDuelRoom(
  idSaber: number,
  idCreador: number
): { ok: true; room: DuelRoomSnapshot } | { ok: false; status: number; error: string } {
  const saber = db
    .prepare('SELECT id_saber, titulo FROM saber WHERE id_saber = ?')
    .get(idSaber) as { id_saber: number; titulo: string } | undefined;

  if (!saber) {
    return { ok: false, status: 404, error: 'El saber seleccionado no existe.' };
  }

  const questions = db
    .prepare(
      `SELECT r.id_respuesta
       FROM respuestas r
       JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion
       WHERE e.id_saber = ?
       ORDER BY e.id_evaluacion ASC, r.id_respuesta ASC`
    )
    .all(idSaber) as Array<{ id_respuesta: number }>;

  if (questions.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'Este saber aún no tiene preguntas configuradas para competencia.',
    };
  }

  const codigo = generateRoomCode();
  const totalPreguntas = questions.length;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const salaInfo = db
      .prepare(
        `INSERT INTO competencia_sala (codigo, id_saber, id_creador, estado)
         VALUES (?, ?, ?, 'esperando')`
      )
      .run(codigo, idSaber, idCreador);
    const idSala = Number(salaInfo.lastInsertRowid);

    const insertQ = db.prepare(
      'INSERT INTO competencia_pregunta (id_sala, orden, id_respuesta) VALUES (?, ?, ?)'
    );
    questions.forEach((q, idx) => {
      insertQ.run(idSala, idx + 1, q.id_respuesta);
    });

    db.prepare(
      `INSERT INTO competencia_participante (id_sala, id_usuario, estado, total_preguntas)
       VALUES (?, ?, 'conectado', ?)`
    ).run(idSala, idCreador, totalPreguntas);

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }

  const room = getRoomSnapshot(codigo, idCreador)!;
  return { ok: true, room };
}

export function joinDuelRoom(
  rawCodigo: string,
  idUsuario: number
): { ok: true; room: DuelRoomSnapshot } | { ok: false; status: number; error: string } {
  const codigo = rawCodigo.trim().toUpperCase();
  if (!codigo) {
    return { ok: false, status: 400, error: 'Ingresa el código de la sala.' };
  }

  let transitionedToActive = false;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const sala = db
      .prepare('SELECT id_sala, estado FROM competencia_sala WHERE codigo = ?')
      .get(codigo) as { id_sala: number; estado: DuelRoomStatus } | undefined;

    if (!sala) {
      db.exec('ROLLBACK;');
      return { ok: false, status: 404, error: 'No existe ninguna sala con ese código.' };
    }

    const existingParticipant = db
      .prepare('SELECT id_participante FROM competencia_participante WHERE id_sala = ? AND id_usuario = ?')
      .get(sala.id_sala, idUsuario);

    if (existingParticipant) {
      db.exec('COMMIT;');
      return { ok: true, room: getRoomSnapshot(codigo, idUsuario)! };
    }

    if (sala.estado !== 'esperando') {
      db.exec('ROLLBACK;');
      return {
        ok: false,
        status: 409,
        error: 'Esta sala ya inició o finalizó. Solicita un nuevo código de competencia.',
      };
    }

    const countRow = db
      .prepare('SELECT COUNT(*) as total FROM competencia_participante WHERE id_sala = ?')
      .get(sala.id_sala) as { total: number };

    if (Number(countRow.total) >= 2) {
      db.exec('ROLLBACK;');
      return { ok: false, status: 409, error: 'La sala ya alcanzó el máximo de 2 participantes.' };
    }

    const qCountRow = db
      .prepare('SELECT COUNT(*) as total FROM competencia_pregunta WHERE id_sala = ?')
      .get(sala.id_sala) as { total: number };
    const totalPreguntas = Number(qCountRow.total);

    db.prepare(
      `INSERT INTO competencia_participante (id_sala, id_usuario, estado, total_preguntas)
       VALUES (?, ?, 'conectado', ?)`
    ).run(sala.id_sala, idUsuario, totalPreguntas);

    const nowMs = Date.now();
    db.prepare(
      `UPDATE competencia_sala
       SET estado = 'en_curso', iniciada_en_ms = ?
       WHERE id_sala = ? AND estado = 'esperando'`
    ).run(nowMs, sala.id_sala);

    transitionedToActive = true;
    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }

  if (transitionedToActive) {
    broadcastRoomState(codigo, 'duel:state');
  }

  const room = getRoomSnapshot(codigo, idUsuario)!;
  return { ok: true, room };
}

export function submitDuelAnswer(params: {
  codigo: string;
  idUsuario: number;
  idRespuesta: number;
  opcion: string;
}):
  | { ok: true; room: DuelRoomSnapshot; finishedNow: boolean }
  | { ok: false; status: number; error: string } {
  const codigo = params.codigo.trim().toUpperCase();
  const opcion = params.opcion.trim().toUpperCase();
  if (!['A', 'B', 'C'].includes(opcion)) {
    return { ok: false, status: 400, error: 'Opción inválida. Selecciona A, B o C.' };
  }

  let finishedNow = false;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const sala = db
      .prepare('SELECT id_sala, estado, iniciada_en_ms FROM competencia_sala WHERE codigo = ?')
      .get(codigo) as
      | { id_sala: number; estado: DuelRoomStatus; iniciada_en_ms: number | null }
      | undefined;

    if (!sala) {
      db.exec('ROLLBACK;');
      return { ok: false, status: 404, error: 'Sala de competencia no encontrada.' };
    }

    if (sala.estado !== 'en_curso') {
      db.exec('ROLLBACK;');
      return {
        ok: false,
        status: 409,
        error:
          sala.estado === 'esperando'
            ? 'La competencia aún espera al segundo jugador.'
            : 'La competencia ya finalizó.',
      };
    }

    const participant = db
      .prepare('SELECT id_participante, estado, total_preguntas FROM competencia_participante WHERE id_sala = ? AND id_usuario = ?')
      .get(sala.id_sala, params.idUsuario) as
      | { id_participante: number; estado: string; total_preguntas: number }
      | undefined;

    if (!participant) {
      db.exec('ROLLBACK;');
      return { ok: false, status: 403, error: 'No perteneces a esta sala de competencia.' };
    }

    const questionInRoom = db
      .prepare('SELECT id_respuesta FROM competencia_pregunta WHERE id_sala = ? AND id_respuesta = ?')
      .get(sala.id_sala, params.idRespuesta);

    if (!questionInRoom) {
      db.exec('ROLLBACK;');
      return { ok: false, status: 400, error: 'La pregunta no pertenece a esta sala.' };
    }

    const correctaRow = db
      .prepare('SELECT opcion_correcta FROM respuesta_correcta WHERE id_respuesta = ?')
      .get(params.idRespuesta) as { opcion_correcta: 'A' | 'B' | 'C' } | undefined;

    if (!correctaRow) {
      db.exec('ROLLBACK;');
      return { ok: false, status: 500, error: 'Pregunta sin respuesta correcta configurada.' };
    }

    const nowMs = Date.now();
    const esCorrecta = opcion === correctaRow.opcion_correcta ? 1 : 0;

    db.prepare(
      `INSERT OR IGNORE INTO competencia_respuesta_usuario
       (id_sala, id_usuario, id_respuesta, opcion_elegida, es_correcta, respondida_en_ms)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(sala.id_sala, params.idUsuario, params.idRespuesta, opcion, esCorrecta, nowMs);

    const stats = db
      .prepare(
        `SELECT COUNT(*) as respondidas, COALESCE(SUM(es_correcta), 0) as aciertos
         FROM competencia_respuesta_usuario
         WHERE id_sala = ? AND id_usuario = ?`
      )
      .get(sala.id_sala, params.idUsuario) as { respondidas: number; aciertos: number };

    const respondidas = Number(stats.respondidas);
    const aciertos = Number(stats.aciertos);
    const totalPreguntas = Math.max(1, Number(participant.total_preguntas));
    const puntuacion = Number(((aciertos / totalPreguntas) * 5).toFixed(2));

    if (respondidas >= totalPreguntas && participant.estado !== 'finalizado') {
      const tiempoMs = sala.iniciada_en_ms ? Math.max(1, nowMs - sala.iniciada_en_ms) : 1;
      db.prepare(
        `UPDATE competencia_participante
         SET estado = 'finalizado', puntuacion = ?, aciertos = ?, finalizado_en_ms = ?, tiempo_ms = ?
         WHERE id_sala = ? AND id_usuario = ?`
      ).run(puntuacion, aciertos, nowMs, tiempoMs, sala.id_sala, params.idUsuario);
    } else {
      db.prepare(
        `UPDATE competencia_participante
         SET puntuacion = ?, aciertos = ?
         WHERE id_sala = ? AND id_usuario = ?`
      ).run(puntuacion, aciertos, sala.id_sala, params.idUsuario);
    }

    // Verificar si ambos participantes concluyeron (incluso simultáneamente)
    const allParticipants = db
      .prepare(
        `SELECT id_usuario, estado, puntuacion, tiempo_ms
         FROM competencia_participante
         WHERE id_sala = ?`
      )
      .all(sala.id_sala) as Array<{
      id_usuario: number;
      estado: 'conectado' | 'finalizado' | 'desconectado';
      puntuacion: number;
      tiempo_ms: number | null;
    }>;

    if (
      allParticipants.length === 2 &&
      allParticipants.every((p) => p.estado === 'finalizado' || p.estado === 'desconectado')
    ) {
      const [p1, p2] = allParticipants;
      let winnerId: number | null = null;
      if (p1.estado === 'finalizado' && p2.estado === 'desconectado') {
        winnerId = Number(p1.id_usuario);
      } else if (p2.estado === 'finalizado' && p1.estado === 'desconectado') {
        winnerId = Number(p2.id_usuario);
      } else if (Number(p1.puntuacion) !== Number(p2.puntuacion)) {
        winnerId = Number(p1.puntuacion) > Number(p2.puntuacion) ? Number(p1.id_usuario) : Number(p2.id_usuario);
      } else {
        const t1 = Number(p1.tiempo_ms ?? Number.MAX_SAFE_INTEGER);
        const t2 = Number(p2.tiempo_ms ?? Number.MAX_SAFE_INTEGER);
        if (t1 !== t2) {
          winnerId = t1 < t2 ? Number(p1.id_usuario) : Number(p2.id_usuario);
        }
      }

      db.prepare(
        `UPDATE competencia_sala
         SET estado = 'finalizada', finalizada_en_ms = ?, motivo_cierre = 'completada', id_ganador = ?
         WHERE id_sala = ? AND estado = 'en_curso'`
      ).run(nowMs, winnerId, sala.id_sala);

      finishedNow = true;
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

  if (finishedNow) {
    clearAllRoomTimers(codigo);
    broadcastRoomState(codigo, 'duel:finished');
  } else {
    broadcastRoomState(codigo, 'duel:state');
  }

  return { ok: true, room: getRoomSnapshot(codigo, params.idUsuario)!, finishedNow };
}

export function finalizeByDisconnect(codigo: string, disconnectedUserId: number): boolean {
  let finalized = false;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const sala = db
      .prepare('SELECT id_sala, estado, iniciada_en_ms FROM competencia_sala WHERE codigo = ?')
      .get(codigo) as
      | { id_sala: number; estado: DuelRoomStatus; iniciada_en_ms: number | null }
      | undefined;

    if (!sala || sala.estado !== 'en_curso') {
      db.exec('ROLLBACK;');
      return false;
    }

    const participants = db
      .prepare(
        'SELECT id_usuario, estado, tiempo_ms FROM competencia_participante WHERE id_sala = ?'
      )
      .all(sala.id_sala) as Array<{
      id_usuario: number;
      estado: 'conectado' | 'finalizado' | 'desconectado';
      tiempo_ms: number | null;
    }>;

    const target = participants.find((p) => Number(p.id_usuario) === disconnectedUserId);
    const opponent = participants.find((p) => Number(p.id_usuario) !== disconnectedUserId);

    if (!target || target.estado === 'finalizado') {
      db.exec('ROLLBACK;');
      return false;
    }

    const nowMs = Date.now();
    const elapsedMs = sala.iniciada_en_ms ? Math.max(1, nowMs - sala.iniciada_en_ms) : 1;

    db.prepare(
      `UPDATE competencia_participante
       SET estado = 'desconectado', desconectado_en_ms = ?, tiempo_ms = COALESCE(tiempo_ms, ?)
       WHERE id_sala = ? AND id_usuario = ?`
    ).run(nowMs, elapsedMs, sala.id_sala, disconnectedUserId);

    if (opponent && opponent.estado === 'conectado') {
      db.prepare(
        `UPDATE competencia_participante
         SET tiempo_ms = COALESCE(tiempo_ms, ?)
         WHERE id_sala = ? AND id_usuario = ?`
      ).run(elapsedMs, sala.id_sala, Number(opponent.id_usuario));
    }

    const winnerId = opponent ? Number(opponent.id_usuario) : null;
    db.prepare(
      `UPDATE competencia_sala
       SET estado = 'finalizada', finalizada_en_ms = ?, motivo_cierre = 'desconexion', id_ganador = ?
       WHERE id_sala = ? AND estado = 'en_curso'`
    ).run(nowMs, winnerId, sala.id_sala);

    finalized = true;
    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }

  if (finalized) {
    clearAllRoomTimers(codigo);
    broadcastRoomState(codigo, 'duel:finished');
  }
  return finalized;
}

export function getRoomSnapshot(rawCodigo: string, currentUserId: number): DuelRoomSnapshot | null {
  const codigo = rawCodigo.trim().toUpperCase();
  const sala = db
    .prepare(
      `SELECT cs.id_sala, cs.codigo, cs.id_saber, s.titulo as saber_titulo, g.nombre_grado,
              cs.id_creador, cs.estado, cs.creada_en, cs.iniciada_en_ms, cs.finalizada_en_ms,
              cs.motivo_cierre, cs.id_ganador
       FROM competencia_sala cs
       JOIN saber s ON s.id_saber = cs.id_saber
       JOIN grado g ON g.id_grado = s.id_grado
       WHERE cs.codigo = ?`
    )
    .get(codigo) as
    | {
        id_sala: number;
        codigo: string;
        id_saber: number;
        saber_titulo: string;
        nombre_grado: string;
        id_creador: number;
        estado: DuelRoomStatus;
        creada_en: string;
        iniciada_en_ms: number | null;
        finalizada_en_ms: number | null;
        motivo_cierre: string | null;
        id_ganador: number | null;
      }
    | undefined;

  if (!sala) return null;

  const participantRows = db
    .prepare(
      `SELECT cp.id_usuario, TRIM(u.nombre || ' ' || u.apellido) as nombre_usuario,
              cp.estado, cp.puntuacion, cp.aciertos, cp.total_preguntas, cp.tiempo_ms
       FROM competencia_participante cp
       JOIN usuario u ON u.id_usuario = cp.id_usuario
       WHERE cp.id_sala = ?
       ORDER BY cp.id_participante ASC`
    )
    .all(sala.id_sala) as Array<{
    id_usuario: number;
    nombre_usuario: string;
    estado: 'conectado' | 'finalizado' | 'desconectado';
    puntuacion: number;
    aciertos: number;
    total_preguntas: number;
    tiempo_ms: number | null;
  }>;

  if (!participantRows.some((p) => Number(p.id_usuario) === currentUserId)) {
    return null;
  }

  const answerRows = db
    .prepare(
      `SELECT id_usuario, id_respuesta, opcion_elegida, es_correcta
       FROM competencia_respuesta_usuario
       WHERE id_sala = ?`
    )
    .all(sala.id_sala) as Array<{
    id_usuario: number;
    id_respuesta: number;
    opcion_elegida: 'A' | 'B' | 'C';
    es_correcta: number;
  }>;

  const answeredCountByUser = new Map<number, number>();
  const myAnswers = new Map<number, 'A' | 'B' | 'C'>();
  const answersLookup = new Map<string, { opcion_elegida: 'A' | 'B' | 'C'; es_correcta: boolean }>();

  for (const ans of answerRows) {
    const uid = Number(ans.id_usuario);
    const qid = Number(ans.id_respuesta);
    answeredCountByUser.set(uid, (answeredCountByUser.get(uid) ?? 0) + 1);
    if (uid === currentUserId) {
      myAnswers.set(qid, ans.opcion_elegida);
    }
    answersLookup.set(`${uid}:${qid}`, {
      opcion_elegida: ans.opcion_elegida,
      es_correcta: Number(ans.es_correcta) === 1,
    });
  }

  const participantes: DuelParticipantView[] = participantRows.map((p) => {
    const uid = Number(p.id_usuario);
    return {
      id_usuario: uid,
      nombre_usuario: p.nombre_usuario,
      estado: p.estado,
      en_linea: isUserOnlineInRoom(sala.codigo, uid),
      puntuacion: Number(p.puntuacion),
      aciertos: Number(p.aciertos),
      respondidas: answeredCountByUser.get(uid) ?? 0,
      total_preguntas: Number(p.total_preguntas),
      tiempo_ms: p.tiempo_ms !== null ? Number(p.tiempo_ms) : null,
      es_usuario_actual: uid === currentUserId,
    };
  });

  const questionRows = db
    .prepare(
      `SELECT cp.orden, r.id_respuesta, r.enunciado_pregunta, r.opcion_a, r.opcion_b, r.opcion_c,
              rc.opcion_correcta, rc.explicacion
       FROM competencia_pregunta cp
       JOIN respuestas r ON r.id_respuesta = cp.id_respuesta
       LEFT JOIN respuesta_correcta rc ON rc.id_respuesta = r.id_respuesta
       WHERE cp.id_sala = ?
       ORDER BY cp.orden ASC`
    )
    .all(sala.id_sala) as Array<{
    orden: number;
    id_respuesta: number;
    enunciado_pregunta: string;
    opcion_a: string;
    opcion_b: string;
    opcion_c: string;
    opcion_correcta: 'A' | 'B' | 'C' | null;
    explicacion: string | null;
  }>;

  const preguntas: DuelQuestionView[] = questionRows.map((q) => ({
    orden: Number(q.orden),
    id_respuesta: Number(q.id_respuesta),
    enunciado_pregunta: q.enunciado_pregunta,
    opcion_a: q.opcion_a,
    opcion_b: q.opcion_b,
    opcion_c: q.opcion_c,
    mi_opcion: myAnswers.get(Number(q.id_respuesta)) ?? null,
  }));

  const comparacion: DuelQuestionComparison[] | null =
    sala.estado === 'finalizada'
      ? questionRows.map((q) => {
          const qid = Number(q.id_respuesta);
          const respuestasPorUsuario: DuelQuestionComparison['respuestas_por_usuario'] = {};
          for (const p of participantes) {
            respuestasPorUsuario[p.id_usuario] = answersLookup.get(`${p.id_usuario}:${qid}`) ?? null;
          }
          return {
            orden: Number(q.orden),
            id_respuesta: qid,
            enunciado_pregunta: q.enunciado_pregunta,
            opcion_a: q.opcion_a,
            opcion_b: q.opcion_b,
            opcion_c: q.opcion_c,
            opcion_correcta: q.opcion_correcta ?? 'A',
            explicacion: q.explicacion,
            respuestas_por_usuario: respuestasPorUsuario,
          };
        })
      : null;

  return {
    id_sala: Number(sala.id_sala),
    codigo: sala.codigo,
    id_saber: Number(sala.id_saber),
    saber_titulo: sala.saber_titulo,
    nombre_grado: sala.nombre_grado,
    id_creador: Number(sala.id_creador),
    estado: sala.estado,
    creada_en: sala.creada_en,
    iniciada_en_ms: sala.iniciada_en_ms !== null ? Number(sala.iniciada_en_ms) : null,
    finalizada_en_ms: sala.finalizada_en_ms !== null ? Number(sala.finalizada_en_ms) : null,
    motivo_cierre: sala.motivo_cierre,
    id_ganador: sala.id_ganador !== null ? Number(sala.id_ganador) : null,
    participantes,
    preguntas,
    comparacion,
  };
}

export function listUserDuelHistory(idUsuario: number): DuelHistoryItem[] {
  const rows = db
    .prepare(
      `SELECT cs.id_sala, cs.codigo, cs.id_saber, s.titulo as saber_titulo,
              cs.estado, cs.creada_en, cs.motivo_cierre, cs.id_ganador,
              mi.puntuacion as mi_puntuacion, mi.aciertos as mi_aciertos,
              mi.total_preguntas as total_preguntas, mi.tiempo_ms as mi_tiempo_ms,
              TRIM(op_u.nombre || ' ' || op_u.apellido) as oponente_nombre,
              op.puntuacion as oponente_puntuacion, op.aciertos as oponente_aciertos,
              op.tiempo_ms as oponente_tiempo_ms
       FROM competencia_participante mi
       JOIN competencia_sala cs ON cs.id_sala = mi.id_sala
       JOIN saber s ON s.id_saber = cs.id_saber
       LEFT JOIN competencia_participante op ON op.id_sala = cs.id_sala AND op.id_usuario != mi.id_usuario
       LEFT JOIN usuario op_u ON op_u.id_usuario = op.id_usuario
       WHERE mi.id_usuario = ?
       ORDER BY cs.id_sala DESC
       LIMIT 20`
    )
    .all(idUsuario) as unknown as DuelHistoryItem[];

  return rows.map((r) => ({
    ...r,
    id_sala: Number(r.id_sala),
    id_saber: Number(r.id_saber),
    id_ganador: r.id_ganador !== null ? Number(r.id_ganador) : null,
    mi_puntuacion: Number(r.mi_puntuacion),
    mi_aciertos: Number(r.mi_aciertos),
    total_preguntas: Number(r.total_preguntas),
    mi_tiempo_ms: r.mi_tiempo_ms !== null ? Number(r.mi_tiempo_ms) : null,
    oponente_puntuacion: r.oponente_puntuacion !== null ? Number(r.oponente_puntuacion) : null,
    oponente_aciertos: r.oponente_aciertos !== null ? Number(r.oponente_aciertos) : null,
    oponente_tiempo_ms: r.oponente_tiempo_ms !== null ? Number(r.oponente_tiempo_ms) : null,
  }));
}

function extractTokenFromUpgrade(req: IncomingMessage, url: URL): string | null {
  const queryToken = url.searchParams.get('token');
  if (queryToken && queryToken.trim()) return queryToken.trim();
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function attachDuelWebSocketServer(
  httpServer: HttpServer,
  options?: { disconnectGraceMs?: number }
) {
  const disconnectGraceMs =
    options?.disconnectGraceMs ?? Number(process.env.DUEL_DISCONNECT_GRACE_MS ?? 3500);
  const wss = new WebSocketServer({ noServer: true });

  const upgradeHandler = (req: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
    const base = `http://${req.headers.host || 'localhost'}`;
    let url: URL;
    try {
      url = new URL(req.url || '/', base);
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname !== '/ws/duelos') {
      return;
    }

    const token = extractTokenFromUpgrade(req, url);
    const verified = token ? verifySessionToken(token) : null;
    if (!verified) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const currentSv = getUserSessionVersion(verified.uid);
    if (currentSv === null || currentSv !== verified.sv) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const profile = loadUserProfile(verified.uid);
    if (!profile) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const codigo = (url.searchParams.get('codigo') || '').trim().toUpperCase();
    const roomSnapshot = codigo ? getRoomSnapshot(codigo, profile.id_usuario) : null;
    if (!roomSnapshot) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, { codigo, userId: profile.id_usuario });
    });
  };

  httpServer.on('upgrade', upgradeHandler);

  wss.on('connection', (ws: WebSocket, ctx: { codigo: string; userId: number }) => {
    const { codigo, userId } = ctx;
    clearDisconnectTimer(codigo, userId);

    if (!roomSockets.has(codigo)) {
      roomSockets.set(codigo, new Map());
    }
    const roomMap = roomSockets.get(codigo)!;
    if (!roomMap.has(userId)) {
      roomMap.set(userId, new Set());
    }
    roomMap.get(userId)!.add(ws);

    // Sincronización inicial y notificación de presencia
    broadcastRoomState(codigo, 'duel:state');

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString('utf8')) as {
          type?: string;
          id_respuesta?: number;
          opcion?: string;
        };

        if (msg.type === 'duel:answer') {
          const result = submitDuelAnswer({
            codigo,
            idUsuario: userId,
            idRespuesta: Number(msg.id_respuesta),
            opcion: String(msg.opcion ?? ''),
          });
          if (!result.ok) {
            ws.send(JSON.stringify({ type: 'duel:error', error: result.error }));
          }
        }
      } catch {
        ws.send(JSON.stringify({ type: 'duel:error', error: 'Mensaje inválido.' }));
      }
    });

    ws.on('close', () => {
      const rMap = roomSockets.get(codigo);
      const uSet = rMap?.get(userId);
      if (uSet) {
        uSet.delete(ws);
        if (uSet.size === 0) {
          rMap!.delete(userId);
        }
      }
      if (rMap && rMap.size === 0) {
        roomSockets.delete(codigo);
      }

      if (isUserOnlineInRoom(codigo, userId)) {
        return;
      }

      const currentSnapshot = getRoomSnapshot(codigo, userId);
      if (!currentSnapshot || currentSnapshot.estado !== 'en_curso') {
        return;
      }

      broadcastRoomNotice(
        codigo,
        {
          type: 'duel:opponent_disconnecting',
          id_usuario: userId,
          grace_ms: disconnectGraceMs,
        },
        userId
      );

      const timer = setTimeout(() => {
        disconnectTimers.delete(timerKey(codigo, userId));
        if (!isUserOnlineInRoom(codigo, userId)) {
          finalizeByDisconnect(codigo, userId);
        }
      }, disconnectGraceMs);
      disconnectTimers.set(timerKey(codigo, userId), timer);
    });
  });

  return {
    wss,
    close: async () => {
      httpServer.off('upgrade', upgradeHandler);
      for (const timer of disconnectTimers.values()) {
        clearTimeout(timer);
      }
      disconnectTimers.clear();
      roomSockets.clear();
      for (const client of wss.clients) {
        client.terminate();
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
