export const SESSION_LIMIT_WARNING_MS = 90_000; // 1 minuto y 30 segundos

export interface StoredSessionLimit {
  userId: number;
  endsAtMs: number;
  totalDurationMs: number;
}

export interface SessionLimitStatus {
  active: boolean;
  remainingMs: number;
  shouldWarn: boolean;
  isExpired: boolean;
}

const STORAGE_KEY = 'aba_session_limit_state';

export function computeSessionLimitStatus(
  endsAtMs: number | null,
  nowMs: number = Date.now()
): SessionLimitStatus {
  if (endsAtMs === null || !Number.isFinite(endsAtMs)) {
    return {
      active: false,
      remainingMs: 0,
      shouldWarn: false,
      isExpired: false,
    };
  }

  const remainingMs = Math.max(0, endsAtMs - nowMs);
  const isExpired = remainingMs <= 0;
  const shouldWarn = !isExpired && remainingMs <= SESSION_LIMIT_WARNING_MS;

  return {
    active: true,
    remainingMs,
    shouldWarn,
    isExpired,
  };
}

export function parseCustomDurationMs(minutes: number, seconds: number): number | null {
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  const mins = Math.floor(minutes);
  const secs = Math.floor(seconds);
  if (mins < 0 || secs < 0 || secs > 59 || mins > 480) return null;
  const totalMs = (mins * 60 + secs) * 1000;
  return totalMs > 0 ? totalMs : null;
}

export function loadStoredSessionLimit(userId: number): StoredSessionLimit | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSessionLimit>;
    if (
      parsed.userId !== userId ||
      typeof parsed.endsAtMs !== 'number' ||
      typeof parsed.totalDurationMs !== 'number'
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      endsAtMs: parsed.endsAtMs,
      totalDurationMs: parsed.totalDurationMs,
    };
  } catch {
    return null;
  }
}

export function saveStoredSessionLimit(limit: StoredSessionLimit | null): void {
  try {
    if (!limit) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(limit));
    }
  } catch {
    // Ignorar en entornos sin sessionStorage
  }
}
