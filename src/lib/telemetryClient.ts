import { apiFetch } from './api';

const SCHEMA_VERSION = '1.1.0';
const STORAGE_QUEUE_KEY = 'aba_telemetry_retry_queue_v1';
const STORAGE_SESSION_KEY = 'aba_telemetry_client_session_v1';
const MAX_LOCAL_QUEUE = 100;

export interface ClientTelemetryPayload {
  event_id: string;
  schema_version: string;
  event_type: string;
  occurred_at_utc: string;
  session_or_request_id: string;
  origin: 'frontend_ui';
  entity_type?: string | null;
  entity_id?: string | null;
  duration_ms?: number | null;
  outcome?: 'success' | 'client_error' | 'server_error';
  metadata?: Record<string, unknown>;
}

let memoryQueue: ClientTelemetryPayload[] = [];
let flushTimer: number | null = null;

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getClientSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(STORAGE_SESSION_KEY);
    if (existing) return existing;
    const created = `ui-${generateUuid()}`;
    window.sessionStorage.setItem(STORAGE_SESSION_KEY, created);
    return created;
  } catch {
    return `ui-${Date.now()}`;
  }
}

function loadStoredQueue(): ClientTelemetryPayload[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ClientTelemetryPayload[]) : [];
  } catch {
    return [];
  }
}

function persistQueue(items: ClientTelemetryPayload[]): void {
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(STORAGE_QUEUE_KEY);
    } else {
      window.localStorage.setItem(
        STORAGE_QUEUE_KEY,
        JSON.stringify(items.slice(-MAX_LOCAL_QUEUE))
      );
    }
  } catch {
    // No bloquear la UI si localStorage no está disponible
  }
}

export async function flushClientTelemetry(): Promise<void> {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }

  const stored = loadStoredQueue();
  const combined = [...stored, ...memoryQueue].slice(-MAX_LOCAL_QUEUE);
  memoryQueue = [];
  if (combined.length === 0) return;

  // Vaciar almacenamiento optimísticamente; si falla la red, reencolar sin duplicar event_id
  persistQueue([]);

  try {
    const res = await apiFetch('/api/telemetria/eventos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: combined.slice(0, 50) }),
      keepalive: true,
    });
    if (!res.ok) {
      persistQueue(combined);
    } else if (combined.length > 50) {
      persistQueue(combined.slice(50));
    }
  } catch {
    persistQueue(combined);
  }
}

export function trackUiEvent(
  eventType: string,
  options?: {
    entityType?: string | null;
    entityId?: string | number | null;
    durationMs?: number | null;
    outcome?: 'success' | 'client_error' | 'server_error';
    metadata?: Record<string, unknown>;
  }
): void {
  try {
    const payload: ClientTelemetryPayload = {
      event_id: `fe-${generateUuid()}`,
      schema_version: SCHEMA_VERSION,
      event_type: eventType,
      occurred_at_utc: new Date().toISOString(),
      session_or_request_id: getClientSessionId(),
      origin: 'frontend_ui',
      entity_type: options?.entityType ?? null,
      entity_id:
        options?.entityId !== undefined && options?.entityId !== null
          ? String(options.entityId)
          : null,
      duration_ms: options?.durationMs ?? null,
      outcome: options?.outcome ?? 'success',
      metadata: options?.metadata,
    };

    memoryQueue.push(payload);
    if (memoryQueue.length >= 10) {
      void flushClientTelemetry();
      return;
    }

    if (flushTimer === null) {
      flushTimer = window.setTimeout(() => {
        void flushClientTelemetry();
      }, 1500);
    }
  } catch {
    // La telemetría nunca debe lanzar excepciones en la interfaz de usuario
  }
}
