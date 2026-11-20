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

export type VirtualRoomStatus = 'activa' | 'cerrada';

export interface VirtualRoomParticipant {
  peer_id: string;
  id_usuario: number;
  nombre_usuario: string;
  nombre_rol: string;
  es_anfitrion: boolean;
  mic_enabled: boolean;
  cam_enabled: boolean;
  conectado_en_ms: number;
}

export interface VirtualRoomMessage {
  id_mensaje: number;
  id_usuario: number;
  nombre_usuario: string;
  nombre_rol: string;
  contenido: string;
  enviado_en_ms: number;
}

export interface VirtualRoomSummary {
  id_sala_virtual: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  id_saber: number | null;
  saber_titulo: string | null;
  id_creador: number;
  creador_nombre: string;
  estado: VirtualRoomStatus;
  creada_en: string;
  participantes_conectados: number;
}

export interface VirtualRoomDetail extends VirtualRoomSummary {
  participantes: VirtualRoomParticipant[];
  mensajes: VirtualRoomMessage[];
}

interface RoomSocketEntry {
  ws: WebSocket;
  peerId: string;
  idUsuario: number;
  nombreUsuario: string;
  nombreRol: string;
  esAnfitrion: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  conectadoEnMs: number;
  isAlive: boolean;
}

// Registro autoritativo en memoria de participantes conectados por sala (`codigo -> Map<peerId, RoomSocketEntry>`)
const activeRoomPeers = new Map<string, Map<string, RoomSocketEntry>>();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateVirtualRoomCode(): string {
  for (let attempt = 0; attempt < 15; attempt++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    const exists = db
      .prepare('SELECT id_sala_virtual FROM sala_virtual WHERE codigo = ?')
      .get(code);
    if (!exists) return code;
  }
  return `S${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

export function getConnectedParticipants(codigo: string): VirtualRoomParticipant[] {
  const norm = codigo.trim().toUpperCase();
  const roomMap = activeRoomPeers.get(norm);
  if (!roomMap) return [];

  const list: VirtualRoomParticipant[] = [];
  for (const entry of roomMap.values()) {
    if (entry.ws.readyState === WebSocket.OPEN) {
      list.push({
        peer_id: entry.peerId,
        id_usuario: entry.idUsuario,
        nombre_usuario: entry.nombreUsuario,
        nombre_rol: entry.nombreRol,
        es_anfitrion: entry.esAnfitrion,
        mic_enabled: entry.micEnabled,
        cam_enabled: entry.camEnabled,
        conectado_en_ms: entry.conectadoEnMs,
      });
    }
  }
  return list.sort((a, b) => a.conectado_en_ms - b.conectado_en_ms);
}

function getRoomRow(codigo: string) {
  return db
    .prepare(
      `SELECT sv.id_sala_virtual, sv.codigo, sv.nombre, sv.descripcion, sv.id_saber,
              s.titulo as saber_titulo, sv.id_creador,
              TRIM(u.nombre || ' ' || u.apellido) as creador_nombre,
              sv.estado, sv.creada_en
       FROM sala_virtual sv
       JOIN usuario u ON u.id_usuario = sv.id_creador
       LEFT JOIN saber s ON s.id_saber = sv.id_saber
       WHERE sv.codigo = ?`
    )
    .get(codigo.trim().toUpperCase()) as
    | {
        id_sala_virtual: number;
        codigo: string;
        nombre: string;
        descripcion: string | null;
        id_saber: number | null;
        saber_titulo: string | null;
        id_creador: number;
        creador_nombre: string;
        estado: VirtualRoomStatus;
        creada_en: string;
      }
    | undefined;
}

export function listActiveVirtualRooms(): VirtualRoomSummary[] {
  const rows = db
    .prepare(
      `SELECT sv.id_sala_virtual, sv.codigo, sv.nombre, sv.descripcion, sv.id_saber,
              s.titulo as saber_titulo, sv.id_creador,
              TRIM(u.nombre || ' ' || u.apellido) as creador_nombre,
              sv.estado, sv.creada_en
       FROM sala_virtual sv
       JOIN usuario u ON u.id_usuario = sv.id_creador
       LEFT JOIN saber s ON s.id_saber = sv.id_saber
       WHERE sv.estado = 'activa'
       ORDER BY sv.id_sala_virtual DESC
       LIMIT 40`
    )
    .all() as unknown as Array<Omit<VirtualRoomSummary, 'participantes_conectados'>>;

  return rows.map((r) => ({
    ...r,
    id_sala_virtual: Number(r.id_sala_virtual),
    id_saber: r.id_saber !== null ? Number(r.id_saber) : null,
    id_creador: Number(r.id_creador),
    participantes_conectados: getConnectedParticipants(r.codigo).length,
  }));
}

export function getVirtualRoomDetails(codigo: string): VirtualRoomDetail | null {
  const row = getRoomRow(codigo);
  if (!row) return null;

  const mensajes = db
    .prepare(
      `SELECT m.id_mensaje, m.id_usuario,
              TRIM(u.nombre || ' ' || u.apellido) as nombre_usuario,
              r.nombre_rol, m.contenido, m.enviado_en_ms
       FROM sala_virtual_mensaje m
       JOIN usuario u ON u.id_usuario = m.id_usuario
       JOIN rol r ON r.id_rol = u.id_rol
       WHERE m.id_sala_virtual = ?
       ORDER BY m.id_mensaje DESC
       LIMIT 80`
    )
    .all(row.id_sala_virtual) as unknown as VirtualRoomMessage[];

  const participantes = getConnectedParticipants(row.codigo);

  return {
    ...row,
    id_sala_virtual: Number(row.id_sala_virtual),
    id_saber: row.id_saber !== null ? Number(row.id_saber) : null,
    id_creador: Number(row.id_creador),
    participantes_conectados: participantes.length,
    participantes,
    mensajes: mensajes.reverse().map((m) => ({
      ...m,
      id_mensaje: Number(m.id_mensaje),
      id_usuario: Number(m.id_usuario),
      enviado_en_ms: Number(m.enviado_en_ms),
    })),
  };
}

export function createVirtualRoom(params: {
  nombre: string;
  descripcion?: string | null;
  idSaber?: number | null;
  idCreador: number;
}):
  | { ok: true; room: VirtualRoomDetail }
  | { ok: false; status: number; error: string } {
  const nombre = typeof params.nombre === 'string' ? params.nombre.trim() : '';
  if (nombre.length < 3 || nombre.length > 100) {
    return {
      ok: false,
      status: 400,
      error: 'El nombre de la sala debe tener entre 3 y 100 caracteres.',
    };
  }

  const descripcionRaw =
    typeof params.descripcion === 'string' ? params.descripcion.trim() : '';
  if (descripcionRaw.length > 400) {
    return {
      ok: false,
      status: 400,
      error: 'La descripción no puede superar los 400 caracteres.',
    };
  }
  const descripcion = descripcionRaw || null;

  let idSaber: number | null = null;
  if (params.idSaber !== undefined && params.idSaber !== null) {
    const parsedSaber = Number(params.idSaber);
    if (!Number.isInteger(parsedSaber) || parsedSaber <= 0) {
      return { ok: false, status: 400, error: 'El saber seleccionado no es válido.' };
    }
    const saberExists = db
      .prepare('SELECT id_saber FROM saber WHERE id_saber = ?')
      .get(parsedSaber);
    if (!saberExists) {
      return { ok: false, status: 404, error: 'El saber seleccionado no existe.' };
    }
    idSaber = parsedSaber;
  }

  const codigo = generateVirtualRoomCode();
  db.prepare(
    `INSERT INTO sala_virtual (codigo, nombre, descripcion, id_saber, id_creador, estado)
     VALUES (?, ?, ?, ?, ?, 'activa')`
  ).run(codigo, nombre, descripcion, idSaber, params.idCreador);

  const detail = getVirtualRoomDetails(codigo)!;
  return { ok: true, room: detail };
}

function broadcastToRoom(
  codigo: string,
  payload: Record<string, unknown>,
  excludePeerId?: string
) {
  const roomMap = activeRoomPeers.get(codigo.trim().toUpperCase());
  if (!roomMap) return;
  const raw = JSON.stringify(payload);
  for (const entry of roomMap.values()) {
    if (excludePeerId && entry.peerId === excludePeerId) continue;
    if (entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(raw);
    }
  }
}

export function closeVirtualRoom(params: {
  codigo: string;
  requesterId: number;
  requesterRole: string;
}):
  | { ok: true }
  | { ok: false; status: number; error: string } {
  const codigo = params.codigo.trim().toUpperCase();
  const room = getRoomRow(codigo);
  if (!room) {
    return { ok: false, status: 404, error: 'Sala virtual no encontrada.' };
  }

  const isHost = Number(room.id_creador) === params.requesterId;
  const isAdmin = params.requesterRole === 'Administrador';
  if (!isHost && !isAdmin) {
    return {
      ok: false,
      status: 403,
      error: 'Solo el anfitrión que creó la sala o un administrador puede cerrarla.',
    };
  }

  db.prepare(
    `UPDATE sala_virtual
     SET estado = 'cerrada', cerrada_en = datetime('now')
     WHERE id_sala_virtual = ?`
  ).run(room.id_sala_virtual);

  broadcastToRoom(codigo, {
    type: 'room:closed',
    codigo,
    message: 'La sala fue cerrada por el anfitrión.',
  });

  const roomMap = activeRoomPeers.get(codigo);
  if (roomMap) {
    for (const entry of roomMap.values()) {
      try {
        entry.ws.close(1000, 'Sala cerrada');
      } catch {
        // Ignorar
      }
    }
    activeRoomPeers.delete(codigo);
  }

  return { ok: true };
}

function extractTokenFromUpgrade(req: IncomingMessage, url: URL): string | null {
  const queryToken = url.searchParams.get('token');
  if (queryToken && queryToken.trim()) return queryToken.trim();
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function attachVirtualRoomWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  const heartbeatInterval = setInterval(() => {
    for (const roomMap of activeRoomPeers.values()) {
      for (const entry of roomMap.values()) {
        if (!entry.isAlive) {
          entry.ws.terminate();
          continue;
        }
        entry.isAlive = false;
        if (entry.ws.readyState === WebSocket.OPEN) {
          entry.ws.ping();
        }
      }
    }
  }, 25_000);

  const upgradeHandler = (
    req: IncomingMessage,
    socket: import('node:stream').Duplex,
    head: Buffer
  ) => {
    const base = `http://${req.headers.host || 'localhost'}`;
    let url: URL;
    try {
      url = new URL(req.url || '/', base);
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname !== '/ws/salas') {
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
    const roomRow = codigo ? getRoomRow(codigo) : undefined;
    if (!roomRow) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    if (roomRow.estado !== 'activa') {
      socket.write('HTTP/1.1 410 Gone\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, {
        codigo: roomRow.codigo,
        idSalaVirtual: Number(roomRow.id_sala_virtual),
        idCreador: Number(roomRow.id_creador),
        idUsuario: profile.id_usuario,
        nombreUsuario: `${profile.nombre} ${profile.apellido}`.trim(),
        nombreRol: profile.nombre_rol,
      });
    });
  };

  httpServer.on('upgrade', upgradeHandler);

  wss.on(
    'connection',
    (
      ws: WebSocket,
      ctx: {
        codigo: string;
        idSalaVirtual: number;
        idCreador: number;
        idUsuario: number;
        nombreUsuario: string;
        nombreRol: string;
      }
    ) => {
      const peerId = `${ctx.idUsuario}-${crypto.randomUUID().slice(0, 8)}`;
      const entry: RoomSocketEntry = {
        ws,
        peerId,
        idUsuario: ctx.idUsuario,
        nombreUsuario: ctx.nombreUsuario,
        nombreRol: ctx.nombreRol,
        esAnfitrion: ctx.idUsuario === ctx.idCreador,
        micEnabled: false,
        camEnabled: false,
        conectadoEnMs: Date.now(),
        isAlive: true,
      };

      if (!activeRoomPeers.has(ctx.codigo)) {
        activeRoomPeers.set(ctx.codigo, new Map());
      }
      const roomMap = activeRoomPeers.get(ctx.codigo)!;
      roomMap.set(peerId, entry);

      ws.on('pong', () => {
        entry.isAlive = true;
      });

      // Enviar sincronización inicial completa al participante recién conectado
      const detail = getVirtualRoomDetails(ctx.codigo);
      if (detail && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'room:state',
            your_peer_id: peerId,
            room: detail,
          })
        );
      }

      // Notificar a todos los participantes la lista actualizada (idempotente)
      broadcastToRoom(ctx.codigo, {
        type: 'room:participants',
        participantes: getConnectedParticipants(ctx.codigo),
      });

      const cleanupPeer = () => {
        const currentMap = activeRoomPeers.get(ctx.codigo);
        if (!currentMap || !currentMap.has(peerId)) return;
        currentMap.delete(peerId);
        if (currentMap.size === 0) {
          activeRoomPeers.delete(ctx.codigo);
        }
        broadcastToRoom(ctx.codigo, {
          type: 'rtc:peer-left',
          peer_id: peerId,
        });
        broadcastToRoom(ctx.codigo, {
          type: 'room:participants',
          participantes: getConnectedParticipants(ctx.codigo),
        });
      };

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString('utf8')) as {
            type?: string;
            contenido?: string;
            mic_enabled?: boolean;
            cam_enabled?: boolean;
            target_peer_id?: string;
            payload?: unknown;
          };

          if (msg.type === 'chat:send') {
            const text = typeof msg.contenido === 'string' ? msg.contenido.trim() : '';
            if (!text || text.length > 1000) {
              ws.send(
                JSON.stringify({
                  type: 'room:error',
                  error: 'El mensaje debe tener entre 1 y 1000 caracteres.',
                })
              );
              return;
            }
            const nowMs = Date.now();
            const info = db
              .prepare(
                `INSERT INTO sala_virtual_mensaje (id_sala_virtual, id_usuario, contenido, enviado_en_ms)
                 VALUES (?, ?, ?, ?)`
              )
              .run(ctx.idSalaVirtual, ctx.idUsuario, text, nowMs);

            const chatMessage: VirtualRoomMessage = {
              id_mensaje: Number(info.lastInsertRowid),
              id_usuario: ctx.idUsuario,
              nombre_usuario: ctx.nombreUsuario,
              nombre_rol: ctx.nombreRol,
              contenido: text,
              enviado_en_ms: nowMs,
            };

            broadcastToRoom(ctx.codigo, {
              type: 'chat:message',
              message: chatMessage,
            });
            return;
          }

          if (msg.type === 'media:state') {
            entry.micEnabled = Boolean(msg.mic_enabled);
            entry.camEnabled = Boolean(msg.cam_enabled);
            broadcastToRoom(ctx.codigo, {
              type: 'room:participants',
              participantes: getConnectedParticipants(ctx.codigo),
            });
            return;
          }

          if (
            msg.type === 'rtc:offer' ||
            msg.type === 'rtc:answer' ||
            msg.type === 'rtc:ice-candidate'
          ) {
            const targetId =
              typeof msg.target_peer_id === 'string' ? msg.target_peer_id.trim() : '';
            if (!targetId || targetId === peerId) return;
            const currentMap = activeRoomPeers.get(ctx.codigo);
            const target = currentMap?.get(targetId);
            if (!target || target.ws.readyState !== WebSocket.OPEN) return;

            target.ws.send(
              JSON.stringify({
                type: msg.type,
                from_peer_id: peerId,
                from_user_name: ctx.nombreUsuario,
                payload: msg.payload ?? null,
              })
            );
            return;
          }

          if (msg.type === 'room:leave') {
            cleanupPeer();
            ws.close(1000, 'Salida voluntaria');
          }
        } catch {
          ws.send(JSON.stringify({ type: 'room:error', error: 'Formato de mensaje inválido.' }));
        }
      });

      ws.on('close', cleanupPeer);
      ws.on('error', cleanupPeer);
    }
  );

  return {
    wss,
    close: async () => {
      clearInterval(heartbeatInterval);
      httpServer.off('upgrade', upgradeHandler);
      activeRoomPeers.clear();
      for (const client of wss.clients) {
        client.terminate();
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
