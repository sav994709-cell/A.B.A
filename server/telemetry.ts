import crypto from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth.ts';
import { db } from './db.ts';

export const CURRENT_TELEMETRY_SCHEMA_VERSION = '1.1.0';
export const SUPPORTED_TELEMETRY_SCHEMA_VERSIONS = new Set(['1.0.0', '1.1.0']);

export type TelemetryOrigin = 'backend_api' | 'frontend_ui' | 'websocket' | 'system_worker';
export type TelemetryOutcome = 'success' | 'client_error' | 'server_error';

export interface TelemetryEventInput {
  event_id: string;
  schema_version?: string;
  event_type: string;
  occurred_at_utc?: string;
  actor_id?: string | number | null;
  actor_id_hash?: string;
  actor_role?: string;
  session_or_request_id: string;
  origin: TelemetryOrigin;
  entity_type?: string | null;
  entity_id?: string | number | null;
  duration_ms?: number | null;
  status_code?: number | null;
  outcome?: TelemetryOutcome | null;
  metadata?: Record<string, unknown> | null;
}

export interface NormalizedTelemetryEvent {
  event_id: string;
  schema_version: string;
  event_type: string;
  occurred_at_utc: string;
  occurred_at_ms: number;
  utc_date: string;
  actor_id_hash: string;
  actor_role: string;
  session_or_request_id: string;
  origin: TelemetryOrigin;
  entity_type: string | null;
  entity_id: string | null;
  duration_ms: number | null;
  status_code: number | null;
  outcome: TelemetryOutcome | null;
  metadata_json: string | null;
}

interface QueuedTelemetryItem {
  event: NormalizedTelemetryEvent;
  attempts: number;
}

const TELEMETRY_HASH_SECRET =
  process.env.TELEMETRY_HASH_SECRET ||
  process.env.SESSION_SECRET ||
  'aba-telemetry-hmac-secret-2026';

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const EVENT_TYPE_REGEX = /^[a-z][a-z0-9_.*:-]{2,79}$/;
const ALLOWED_ORIGINS = new Set<TelemetryOrigin>([
  'backend_api',
  'frontend_ui',
  'websocket',
  'system_worker',
]);
const ALLOWED_OUTCOMES = new Set<TelemetryOutcome>(['success', 'client_error', 'server_error']);

// Claves prohibidas para proteger privacidad (no almacenar PII ni credenciales)
const PII_SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'contrasena',
  'clave',
  'secret',
  'token',
  'refresh_token',
  'access_token',
  'reset_token',
  'authorization',
  'cookie',
  'email',
  'correo',
  'ip',
  'ip_origen',
  'nombre',
  'apellido',
  'nombre_completo',
  'telefono',
  'celular',
  'direccion',
]);

const MAX_QUEUE_SIZE = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const BATCH_SIZE = 100;

const queue: QueuedTelemetryItem[] = [];
let flushScheduled = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Contadores de control para verificación de exactitud y detección de pérdidas
const controlCounters = {
  received: 0,
  validated: 0,
  enqueued: 0,
  persisted: 0,
  deduplicated: 0,
  rejected: 0,
  retried: 0,
  dropped: 0,
  failed_batches: 0,
  last_flush_utc: null as string | null,
  last_error: null as string | null,
};

export function resetTelemetryCountersForTest(): void {
  queue.length = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushScheduled = false;
  controlCounters.received = 0;
  controlCounters.validated = 0;
  controlCounters.enqueued = 0;
  controlCounters.persisted = 0;
  controlCounters.deduplicated = 0;
  controlCounters.rejected = 0;
  controlCounters.retried = 0;
  controlCounters.dropped = 0;
  controlCounters.failed_batches = 0;
  controlCounters.last_flush_utc = null;
  controlCounters.last_error = null;
}

export function pseudonymizeActorId(rawActor: string | number | null | undefined): string {
  if (rawActor === null || rawActor === undefined || rawActor === '') {
    return crypto
      .createHmac('sha256', TELEMETRY_HASH_SECRET)
      .update('actor:anonymous')
      .digest('hex')
      .slice(0, 32);
  }
  const normalized = typeof rawActor === 'number' ? `user:${rawActor}` : String(rawActor).trim();
  return crypto
    .createHmac('sha256', TELEMETRY_HASH_SECRET)
    .update(normalized)
    .digest('hex')
    .slice(0, 32);
}

export function sanitizeTelemetryMetadata(
  raw: Record<string, unknown> | null | undefined,
  depth = 0
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (depth > 3) return null;

  const clean: Record<string, unknown> = {};
  let keysCount = 0;

  for (const [k, v] of Object.entries(raw)) {
    if (keysCount >= 20) break;
    const lowerKey = k.trim().toLowerCase();
    if (!lowerKey || PII_SENSITIVE_KEYS.has(lowerKey)) {
      continue;
    }

    if (v === null || typeof v === 'boolean' || typeof v === 'number') {
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      clean[k] = v;
      keysCount++;
    } else if (typeof v === 'string') {
      // Evitar correos electrónicos embebidos accidentalmente
      const redacted = v.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted-email]');
      clean[k] = redacted.slice(0, 200);
      keysCount++;
    } else if (Array.isArray(v)) {
      clean[k] = v
        .slice(0, 10)
        .filter((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
        .map((item) => (typeof item === 'string' ? item.slice(0, 80) : item));
      keysCount++;
    } else if (typeof v === 'object') {
      const nested = sanitizeTelemetryMetadata(v as Record<string, unknown>, depth + 1);
      if (nested && Object.keys(nested).length > 0) {
        clean[k] = nested;
        keysCount++;
      }
    }
  }

  return Object.keys(clean).length > 0 ? clean : null;
}

/**
 * Normaliza la marca temporal estrictamente a UTC (ISO-8601 terminado en Z).
 * Rechaza cadenas sin zona horaria explícita para evitar mezcla de husos horarios.
 */
export function parseStrictUtcTimestamp(rawUtc: string | undefined): {
  ok: true;
  isoUtc: string;
  epochMs: number;
  utcDate: string;
} | { ok: false; error: string } {
  if (!rawUtc) {
    const nowMs = Date.now();
    const isoUtc = new Date(nowMs).toISOString();
    return { ok: true, isoUtc, epochMs: nowMs, utcDate: isoUtc.slice(0, 10) };
  }

  const trimmed = rawUtc.trim();
  const hasExplicitTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(trimmed);
  if (!hasExplicitTimezone) {
    return {
      ok: false,
      error: 'occurred_at_utc debe incluir zona horaria explícita en UTC (Z o ±HH:MM).',
    };
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isFinite(parsedMs)) {
    return { ok: false, error: 'occurred_at_utc tiene un formato ISO-8601 inválido.' };
  }

  // Tolerar reloj de cliente como máximo ±30 días respecto al reloj del servidor
  const now = Date.now();
  if (parsedMs > now + 5 * 60_000 || parsedMs < now - 365 * 86_400_000) {
    return {
      ok: false,
      error: 'occurred_at_utc está fuera de la ventana temporal aceptada.',
    };
  }

  const isoUtc = new Date(parsedMs).toISOString();
  return {
    ok: true,
    isoUtc,
    epochMs: parsedMs,
    utcDate: isoUtc.slice(0, 10),
  };
}

function inferOutcomeFromStatus(statusCode: number | null): TelemetryOutcome | null {
  if (statusCode === null) return null;
  if (statusCode >= 500) return 'server_error';
  if (statusCode >= 400) return 'client_error';
  return 'success';
}

export function normalizeAndValidateTelemetryEvent(
  raw: TelemetryEventInput
): { ok: true; event: NormalizedTelemetryEvent } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Payload de evento inválido.' };
  }

  const eventId = typeof raw.event_id === 'string' ? raw.event_id.trim() : '';
  if (!eventId || eventId.length < 8 || eventId.length > 128) {
    return { ok: false, error: 'event_id obligatorio (8 a 128 caracteres).' };
  }

  const schemaVersion =
    typeof raw.schema_version === 'string' && raw.schema_version.trim()
      ? raw.schema_version.trim()
      : CURRENT_TELEMETRY_SCHEMA_VERSION;
  if (!SEMVER_REGEX.test(schemaVersion) || !SUPPORTED_TELEMETRY_SCHEMA_VERSIONS.has(schemaVersion)) {
    return {
      ok: false,
      error: `schema_version no soportada: "${schemaVersion}". Versiones válidas: 1.0.0, 1.1.0.`,
    };
  }

  const eventType = typeof raw.event_type === 'string' ? raw.event_type.trim().toLowerCase() : '';
  if (!EVENT_TYPE_REGEX.test(eventType)) {
    return { ok: false, error: 'event_type obligatorio con formato válido (ej. saber.viewed).' };
  }

  if (!ALLOWED_ORIGINS.has(raw.origin)) {
    return { ok: false, error: 'origin obligatorio (backend_api, frontend_ui, websocket o system_worker).' };
  }

  const sessionOrRequestId =
    typeof raw.session_or_request_id === 'string' ? raw.session_or_request_id.trim() : '';
  if (!sessionOrRequestId || sessionOrRequestId.length > 128) {
    return { ok: false, error: 'session_or_request_id obligatorio.' };
  }

  const ts = parseStrictUtcTimestamp(raw.occurred_at_utc);
  if (!ts.ok) {
    return { ok: false, error: ts.error };
  }

  let durationMs: number | null = null;
  if (raw.duration_ms !== undefined && raw.duration_ms !== null) {
    const d = Number(raw.duration_ms);
    if (!Number.isFinite(d) || d < 0 || d > 86_400_000) {
      return { ok: false, error: 'duration_ms debe ser un número finito >= 0.' };
    }
    durationMs = Number(d.toFixed(2));
  }

  let statusCode: number | null = null;
  if (raw.status_code !== undefined && raw.status_code !== null) {
    const sc = Number(raw.status_code);
    if (!Number.isInteger(sc) || sc < 100 || sc > 599) {
      return { ok: false, error: 'status_code debe ser un entero HTTP válido (100–599).' };
    }
    statusCode = sc;
  }

  // Compatibilidad hacia atrás v1.0.0 -> v1.1.0: derivar outcome si viene omitido
  let outcome: TelemetryOutcome | null = null;
  if (raw.outcome !== undefined && raw.outcome !== null) {
    if (!ALLOWED_OUTCOMES.has(raw.outcome)) {
      return { ok: false, error: 'outcome inválido.' };
    }
    outcome = raw.outcome;
  } else {
    outcome = inferOutcomeFromStatus(statusCode);
  }

  const actorHash =
    typeof raw.actor_id_hash === 'string' && /^[a-f0-9]{16,64}$/i.test(raw.actor_id_hash.trim())
      ? raw.actor_id_hash.trim().toLowerCase()
      : pseudonymizeActorId(raw.actor_id);

  const actorRole =
    typeof raw.actor_role === 'string' && raw.actor_role.trim()
      ? raw.actor_role.trim().slice(0, 40)
      : 'Anonimo';

  const entityType =
    typeof raw.entity_type === 'string' && raw.entity_type.trim()
      ? raw.entity_type.trim().toLowerCase().slice(0, 48)
      : null;

  const entityId =
    raw.entity_id !== undefined && raw.entity_id !== null && String(raw.entity_id).trim()
      ? String(raw.entity_id).trim().slice(0, 80)
      : null;

  const cleanMeta = sanitizeTelemetryMetadata(raw.metadata ?? null);

  return {
    ok: true,
    event: {
      event_id: eventId,
      schema_version: schemaVersion,
      event_type: eventType,
      occurred_at_utc: ts.isoUtc,
      occurred_at_ms: ts.epochMs,
      utc_date: ts.utcDate,
      actor_id_hash: actorHash,
      actor_role: actorRole,
      session_or_request_id: sessionOrRequestId,
      origin: raw.origin,
      entity_type: entityType,
      entity_id: entityId,
      duration_ms: durationMs,
      status_code: statusCode,
      outcome,
      metadata_json: cleanMeta ? JSON.stringify(cleanMeta) : null,
    },
  };
}

function scheduleBackgroundFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  flushTimer = setTimeout(() => {
    flushScheduled = false;
    flushTimer = null;
    try {
      flushTelemetryQueue();
    } catch {
      // Nunca dejar escapar excepciones al event loop
    }
  }, 50);
  if (typeof flushTimer.unref === 'function') {
    flushTimer.unref();
  }
}

export function enqueueTelemetryEvent(
  raw: TelemetryEventInput
): { queued: boolean; error?: string } {
  controlCounters.received += 1;
  const validated = normalizeAndValidateTelemetryEvent(raw);
  if (!validated.ok) {
    controlCounters.rejected += 1;
    return { queued: false, error: validated.error };
  }

  controlCounters.validated += 1;
  if (queue.length >= MAX_QUEUE_SIZE) {
    controlCounters.dropped += 1;
    const msg = 'Cola de telemetría llena; evento descartado para proteger memoria.';
    controlCounters.last_error = msg;
    recordFailureSafe(validated.event.event_id, msg, 1, validated.event.event_type);
    return { queued: false, error: msg };
  }

  queue.push({ event: validated.event, attempts: 0 });
  controlCounters.enqueued += 1;
  scheduleBackgroundFlush();
  return { queued: true };
}

function recordFailureSafe(
  eventId: string | null,
  errorMessage: string,
  attempts: number,
  summary: string
): void {
  try {
    db.prepare(
      `INSERT INTO telemetry_pipeline_failure (event_id, error_message, attempts, payload_summary, recorded_at_utc)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      eventId,
      errorMessage.slice(0, 300),
      attempts,
      summary.slice(0, 200),
      new Date().toISOString()
    );
  } catch {
    console.error('[telemetry-pipeline-failure]', { eventId, errorMessage, attempts, summary });
  }
}

export type TelemetryBatchWriter = (events: NormalizedTelemetryEvent[]) => {
  inserted: number;
  deduplicated: number;
};

const defaultSqliteBatchWriter: TelemetryBatchWriter = (events) => {
  let inserted = 0;
  let deduplicated = 0;
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO telemetry_event (
       event_id, schema_version, event_type, occurred_at_utc, occurred_at_ms, utc_date,
       actor_id_hash, actor_role, session_or_request_id, origin,
       entity_type, entity_id, duration_ms, status_code, outcome,
       metadata_json, ingested_at_utc
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const ingestedAtUtc = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    for (const ev of events) {
      const res = stmt.run(
        ev.event_id,
        ev.schema_version,
        ev.event_type,
        ev.occurred_at_utc,
        ev.occurred_at_ms,
        ev.utc_date,
        ev.actor_id_hash,
        ev.actor_role,
        ev.session_or_request_id,
        ev.origin,
        ev.entity_type,
        ev.entity_id,
        ev.duration_ms,
        ev.status_code,
        ev.outcome,
        ev.metadata_json,
        ingestedAtUtc
      );
      if (Number(res.changes) > 0) {
        inserted += 1;
      } else {
        deduplicated += 1;
      }
    }
    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar si la transacción no se abrió
    }
    throw err;
  }

  return { inserted, deduplicated };
};

export function flushTelemetryQueue(
  writer: TelemetryBatchWriter = defaultSqliteBatchWriter
): {
  flushed: number;
  inserted: number;
  deduplicated: number;
  retried: number;
  dropped: number;
} {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushScheduled = false;

  let totalInserted = 0;
  let totalDeduplicated = 0;
  let totalRetried = 0;
  let totalDropped = 0;
  const retryBuffer: QueuedTelemetryItem[] = [];

  while (queue.length > 0) {
    const chunk = queue.splice(0, BATCH_SIZE);
    try {
      const result = writer(chunk.map((c) => c.event));
      controlCounters.persisted += result.inserted;
      controlCounters.deduplicated += result.deduplicated;
      controlCounters.last_flush_utc = new Date().toISOString();
      totalInserted += result.inserted;
      totalDeduplicated += result.deduplicated;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      controlCounters.failed_batches += 1;
      controlCounters.last_error = errMsg;

      for (const item of chunk) {
        const nextAttempts = item.attempts + 1;
        if (nextAttempts < MAX_RETRY_ATTEMPTS) {
          retryBuffer.push({ event: item.event, attempts: nextAttempts });
          controlCounters.retried += 1;
          totalRetried += 1;
        } else {
          controlCounters.dropped += 1;
          totalDropped += 1;
          recordFailureSafe(
            item.event.event_id,
            errMsg,
            nextAttempts,
            `${item.event.event_type} (${item.event.origin})`
          );
        }
      }
    }
  }

  if (retryBuffer.length > 0) {
    queue.push(...retryBuffer);
  }

  return {
    flushed: totalInserted + totalDeduplicated,
    inserted: totalInserted,
    deduplicated: totalDeduplicated,
    retried: totalRetried,
    dropped: totalDropped,
  };
}

export function ingestTelemetryBatchSync(
  rawEvents: TelemetryEventInput[],
  forcedActor?: { userId: number; role: string } | null
): {
  accepted: number;
  deduplicated: number;
  rejected: number;
  errors: Array<{ index: number; error: string }>;
} {
  const validEvents: NormalizedTelemetryEvent[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  rawEvents.forEach((raw, index) => {
    controlCounters.received += 1;
    const enriched: TelemetryEventInput =
      forcedActor && raw && typeof raw === 'object'
        ? {
            ...raw,
            actor_id: forcedActor.userId,
            actor_role: forcedActor.role,
          }
        : raw;

    const res = normalizeAndValidateTelemetryEvent(enriched);
    if (!res.ok) {
      controlCounters.rejected += 1;
      errors.push({ index, error: res.error });
    } else {
      controlCounters.validated += 1;
      validEvents.push(res.event);
    }
  });

  if (validEvents.length === 0) {
    return { accepted: 0, deduplicated: 0, rejected: errors.length, errors };
  }

  try {
    const written = defaultSqliteBatchWriter(validEvents);
    controlCounters.persisted += written.inserted;
    controlCounters.deduplicated += written.deduplicated;
    controlCounters.last_flush_utc = new Date().toISOString();
    return {
      accepted: written.inserted,
      deduplicated: written.deduplicated,
      rejected: errors.length,
      errors,
    };
  } catch (err) {
    // Fallback a cola no bloqueante si SQLite está temporalmente ocupado
    const msg = err instanceof Error ? err.message : String(err);
    controlCounters.last_error = msg;
    for (const ev of validEvents) {
      if (queue.length < MAX_QUEUE_SIZE) {
        queue.push({ event: ev, attempts: 1 });
        controlCounters.retried += 1;
      } else {
        controlCounters.dropped += 1;
      }
    }
    scheduleBackgroundFlush();
    return {
      accepted: validEvents.length,
      deduplicated: 0,
      rejected: errors.length,
      errors,
    };
  }
}

function classifyApiRequest(
  method: string,
  path: string,
  statusCode: number
): { eventType: string; entityType: string | null; entityId: string | null } {
  const cleanPath = path.split('?')[0];

  if (statusCode >= 500) {
    return { eventType: 'http.api_error', entityType: null, entityId: null };
  }
  if (cleanPath === '/auth/login' && method === 'POST') {
    return { eventType: statusCode < 400 ? 'auth.login' : 'auth.login_failed', entityType: 'usuario', entityId: null };
  }
  if (cleanPath === '/auth/register' && method === 'POST') {
    return { eventType: 'auth.register', entityType: 'usuario', entityId: null };
  }
  if (cleanPath === '/saberes/buscar' && method === 'GET') {
    return { eventType: 'saber.searched', entityType: 'saber', entityId: null };
  }
  const saberMatch = /^\/saberes\/(\d+)$/.exec(cleanPath);
  if (saberMatch && method === 'GET') {
    return { eventType: 'saber.viewed', entityType: 'saber', entityId: saberMatch[1] };
  }
  const videoCompleteMatch = /^\/videos\/(\d+)\/completar$/.exec(cleanPath);
  if (videoCompleteMatch && method === 'POST') {
    return { eventType: 'video.completed', entityType: 'video', entityId: videoCompleteMatch[1] };
  }
  const videoMatch = /^\/videos\/(\d+)$/.exec(cleanPath);
  if (videoMatch && method === 'GET') {
    return { eventType: 'video.viewed', entityType: 'video', entityId: videoMatch[1] };
  }
  const evalSubmitMatch = /^\/evaluaciones\/(\d+)\/responder$/.exec(cleanPath);
  if (evalSubmitMatch && method === 'POST') {
    return {
      eventType: 'evaluacion.submitted',
      entityType: 'evaluacion',
      entityId: evalSubmitMatch[1],
    };
  }
  if (cleanPath === '/salas' && method === 'POST') {
    return { eventType: 'sala.created', entityType: 'sala_virtual', entityId: null };
  }
  if (cleanPath.startsWith('/duelos') && method === 'POST') {
    return { eventType: 'duelo.action', entityType: 'competencia_sala', entityId: null };
  }
  if (cleanPath === '/tienda/canjear' && method === 'POST') {
    return { eventType: 'tienda.redeemed', entityType: 'recompensa', entityId: null };
  }
  if (cleanPath.startsWith('/admin/') && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const seg = cleanPath.split('/')[2] || 'entidad';
    const idSeg = cleanPath.split('/')[3] || null;
    return { eventType: 'admin.crud_operation', entityType: seg, entityId: idSeg };
  }

  return {
    eventType: statusCode >= 400 ? 'http.client_error' : 'http.api_request',
    entityType: null,
    entityId: null,
  };
}

/**
 * Middleware automático y no bloqueante para capturar toda actividad API,
 * tiempos de respuesta y errores HTTP en `res.on('finish')`.
 */
export function telemetryCaptureMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const pathOnly = req.path || '';
  // Evitar bucle de telemetría sobre el propio endpoint de ingesta
  if (pathOnly.startsWith('/telemetria')) {
    next();
    return;
  }

  const headerReqId = req.header('x-request-id');
  const requestId =
    headerReqId && headerReqId.trim()
      ? headerReqId.trim().slice(0, 100)
      : `req-${crypto.randomUUID()}`;
  res.setHeader('X-Request-Id', requestId);

  const startedNs = process.hrtime.bigint();
  const occurredAtUtc = new Date().toISOString();

  res.on('finish', () => {
    try {
      const elapsedNs = process.hrtime.bigint() - startedNs;
      const durationMs = Number((Number(elapsedNs) / 1_000_000).toFixed(2));
      const statusCode = res.statusCode;
      const classified = classifyApiRequest(req.method, pathOnly, statusCode);

      enqueueTelemetryEvent({
        event_id: `be-${requestId}`,
        schema_version: CURRENT_TELEMETRY_SCHEMA_VERSION,
        event_type: classified.eventType,
        occurred_at_utc: occurredAtUtc,
        actor_id: req.user?.id_usuario ?? null,
        actor_role: req.user?.nombre_rol ?? 'Anonimo',
        session_or_request_id: requestId,
        origin: 'backend_api',
        entity_type: classified.entityType,
        entity_id: classified.entityId,
        duration_ms: durationMs,
        status_code: statusCode,
        metadata: {
          method: req.method,
          route: pathOnly.slice(0, 120),
        },
      });
    } catch {
      // Nunca interferir con el flujo HTTP principal
    }
  });

  next();
}

export interface TelemetryControlReport {
  schema_actual: string;
  versiones_compatibles: string[];
  estado_pipeline: 'Saludable' | 'Con reintentos' | 'Pérdida detectada';
  contadores_control: {
    recibidos: number;
    validados: number;
    persistidos_sesion: number;
    deduplicados_idempotencia: number;
    rechazados_validacion: number;
    reintentados: number;
    descartados_perdidos: number;
    pendientes_en_cola: number;
    lotes_fallidos: number;
    tasa_perdida_pct: number;
    ultimo_flush_utc: string | null;
    ultimo_error: string | null;
  };
  almacenamiento_analitico: {
    total_eventos_bd: number;
    eventos_ultimas_24h: number;
    actores_unicos_seudonimizados: number;
    tasa_error_http_pct: number;
    latencia_promedio_ms: number;
    latencia_p95_ms: number;
    fallos_registrados_bd: number;
  };
  reconciliacion_aplicacion: {
    puntajes_bd: number;
    eventos_evaluacion_telemetria: number;
    salas_bd: number;
    eventos_sala_telemetria: number;
  };
  por_tipo_evento: Array<{
    event_type: string;
    total: number;
    errores: number;
    latencia_promedio_ms: number | null;
  }>;
  por_fecha_utc: Array<{
    utc_date: string;
    total: number;
    errores: number;
  }>;
  por_version_esquema: Array<{
    schema_version: string;
    total: number;
  }>;
}

export function getTelemetryControlReport(): TelemetryControlReport {
  // Asegurar vaciado de cola pendiente antes de consultar el reporte de control
  flushTelemetryQueue();

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(DISTINCT actor_id_hash) AS actores_unicos,
         SUM(CASE WHEN outcome IN ('client_error', 'server_error') THEN 1 ELSE 0 END) AS total_errores,
         AVG(duration_ms) AS avg_ms
       FROM telemetry_event`
    )
    .get() as {
    total: number;
    actores_unicos: number;
    total_errores: number | null;
    avg_ms: number | null;
  };

  const last24hIso = new Date(Date.now() - 86_400_000).toISOString();
  const last24h = (
    db
      .prepare('SELECT COUNT(*) AS total FROM telemetry_event WHERE occurred_at_utc >= ?')
      .get(last24hIso) as { total: number }
  ).total;

  // Calcular P95 de latencia sobre eventos con duration_ms
  const durations = (
    db
      .prepare(
        'SELECT duration_ms FROM telemetry_event WHERE duration_ms IS NOT NULL ORDER BY duration_ms ASC'
      )
      .all() as Array<{ duration_ms: number }>
  ).map((r) => r.duration_ms);
  const p95 =
    durations.length > 0
      ? Number(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))].toFixed(2))
      : 0;

  const failuresCount = (
    db.prepare('SELECT COUNT(*) AS total FROM telemetry_pipeline_failure').get() as { total: number }
  ).total;

  const byType = db
    .prepare(
      `SELECT event_type,
              COUNT(*) AS total,
              SUM(CASE WHEN outcome IN ('client_error', 'server_error') THEN 1 ELSE 0 END) AS errores,
              ROUND(AVG(duration_ms), 2) AS latencia_promedio_ms
       FROM telemetry_event
       GROUP BY event_type
       ORDER BY total DESC
       LIMIT 12`
    )
    .all() as Array<{
    event_type: string;
    total: number;
    errores: number;
    latencia_promedio_ms: number | null;
  }>;

  const byUtcDate = db
    .prepare(
      `SELECT utc_date,
              COUNT(*) AS total,
              SUM(CASE WHEN outcome IN ('client_error', 'server_error') THEN 1 ELSE 0 END) AS errores
       FROM telemetry_event
       GROUP BY utc_date
       ORDER BY utc_date DESC
       LIMIT 14`
    )
    .all() as Array<{ utc_date: string; total: number; errores: number }>;

  const bySchema = db
    .prepare(
      `SELECT schema_version, COUNT(*) AS total
       FROM telemetry_event
       GROUP BY schema_version
       ORDER BY schema_version DESC`
    )
    .all() as Array<{ schema_version: string; total: number }>;

  // Reconciliación frente a tablas transaccionales clave
  const puntajesBd = (db.prepare('SELECT COUNT(*) AS total FROM puntaje').get() as { total: number }).total;
  const evalTelemetria = (
    db
      .prepare("SELECT COUNT(*) AS total FROM telemetry_event WHERE event_type = 'evaluacion.submitted'")
      .get() as { total: number }
  ).total;
  const salasBd = (
    db.prepare('SELECT COUNT(*) AS total FROM sala_virtual').get() as { total: number }
  ).total;
  const salaTelemetria = (
    db
      .prepare("SELECT COUNT(*) AS total FROM telemetry_event WHERE event_type = 'sala.created'")
      .get() as { total: number }
  ).total;

  const lossRatePct =
    controlCounters.validated > 0
      ? Number(((controlCounters.dropped / controlCounters.validated) * 100).toFixed(2))
      : 0;

  const estadoPipeline: TelemetryControlReport['estado_pipeline'] =
    controlCounters.dropped > 0
      ? 'Pérdida detectada'
      : controlCounters.retried > 0 || controlCounters.failed_batches > 0
        ? 'Con reintentos'
        : 'Saludable';

  const totalDb = Number(totals.total ?? 0);
  const totalErrores = Number(totals.total_errores ?? 0);

  return {
    schema_actual: CURRENT_TELEMETRY_SCHEMA_VERSION,
    versiones_compatibles: Array.from(SUPPORTED_TELEMETRY_SCHEMA_VERSIONS),
    estado_pipeline: estadoPipeline,
    contadores_control: {
      recibidos: controlCounters.received,
      validados: controlCounters.validated,
      persistidos_sesion: controlCounters.persisted,
      deduplicados_idempotencia: controlCounters.deduplicated,
      rechazados_validacion: controlCounters.rejected,
      reintentados: controlCounters.retried,
      descartados_perdidos: controlCounters.dropped,
      pendientes_en_cola: queue.length,
      lotes_fallidos: controlCounters.failed_batches,
      tasa_perdida_pct: lossRatePct,
      ultimo_flush_utc: controlCounters.last_flush_utc,
      ultimo_error: controlCounters.last_error,
    },
    almacenamiento_analitico: {
      total_eventos_bd: totalDb,
      eventos_ultimas_24h: last24h,
      actores_unicos_seudonimizados: Number(totals.actores_unicos ?? 0),
      tasa_error_http_pct: totalDb > 0 ? Number(((totalErrores / totalDb) * 100).toFixed(2)) : 0,
      latencia_promedio_ms: totals.avg_ms ? Number(Number(totals.avg_ms).toFixed(2)) : 0,
      latencia_p95_ms: p95,
      fallos_registrados_bd: failuresCount,
    },
    reconciliacion_aplicacion: {
      puntajes_bd: puntajesBd,
      eventos_evaluacion_telemetria: evalTelemetria,
      salas_bd: salasBd,
      eventos_sala_telemetria: salaTelemetria,
    },
    por_tipo_evento: byType,
    por_fecha_utc: byUtcDate,
    por_version_esquema: bySchema,
  };
}
