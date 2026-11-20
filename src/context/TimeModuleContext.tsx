import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  advanceActiveTime,
  createActiveTimeState,
  forcePauseActiveTime,
  formatLocalDateYYYYMMDD,
  registerUserInteraction,
  type ActiveTimeState,
  type PauseReason,
} from '../lib/activeTimeEngine';
import { apiFetch, getSessionToken } from '../lib/api';

/**
 * Interruptor maestro del módulo de tiempo.
 * Cambia este valor a `false` (o define `VITE_TIME_MODULE_ENABLED=false`)
 * para desactivar por completo el cronómetro global y los cronómetros por actividad.
 */
export const TIME_MODULE_ENABLED =
  import.meta.env.VITE_TIME_MODULE_ENABLED !== 'false';

interface TimeModuleContextValue {
  enabled: boolean;
  sessionStartMs: number;
  activeElapsedMs: number;
  pausedElapsedMs: number;
  isPaused: boolean;
  pauseReason: PauseReason;
  sessionKey: string;
  setTrackedUserId: (userId: number | null) => void;
  finalizeTrackedSession: () => Promise<void>;
}

interface TimeModuleActionsValue {
  enabled: boolean;
  setTrackedUserId: (userId: number | null) => void;
  finalizeTrackedSession: () => Promise<void>;
}

const TimeModuleActionsContext = createContext<TimeModuleActionsValue>({
  enabled: false,
  setTrackedUserId: () => {},
  finalizeTrackedSession: async () => {},
});

const TimeModuleContext = createContext<TimeModuleContextValue>({
  enabled: false,
  sessionStartMs: 0,
  activeElapsedMs: 0,
  pausedElapsedMs: 0,
  isPaused: false,
  pauseReason: null,
  sessionKey: '',
  setTrackedUserId: () => {},
  finalizeTrackedSession: async () => {},
});

function generateSessionKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ses-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readEnvironmentState(): { isVisible: boolean; hasFocus: boolean } {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { isVisible: true, hasFocus: true };
  }
  const isVisible = document.visibilityState !== 'hidden';
  const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return { isVisible, hasFocus };
}

export const TimeModuleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialNow = Date.now();
  const stateRef = useRef<ActiveTimeState>(createActiveTimeState(initialNow));
  const sessionKeyRef = useRef<string>(generateSessionKey());
  const trackedUserIdRef = useRef<number | null>(null);
  const lastSyncMsRef = useRef<number>(0);

  const [snapshot, setSnapshot] = useState<{
    sessionStartMs: number;
    activeElapsedMs: number;
    pausedElapsedMs: number;
    isPaused: boolean;
    pauseReason: PauseReason;
    sessionKey: string;
  }>(() => ({
    sessionStartMs: initialNow,
    activeElapsedMs: 0,
    pausedElapsedMs: 0,
    isPaused: false,
    pauseReason: null,
    sessionKey: sessionKeyRef.current,
  }));

  const publishSnapshot = useCallback((next: ActiveTimeState) => {
    setSnapshot({
      sessionStartMs: next.sessionStartedAtMs,
      activeElapsedMs: next.activeMs,
      pausedElapsedMs: next.pausedMs,
      isPaused: next.isPaused,
      pauseReason: next.pauseReason,
      sessionKey: sessionKeyRef.current,
    });
  }, []);

  const syncToBackend = useCallback(async (final = false, keepalive = false) => {
    if (!TIME_MODULE_ENABLED || !trackedUserIdRef.current) return;
    const token = getSessionToken();
    const st = stateRef.current;
    const endpoint = final ? '/api/tiempo/finalizar' : '/api/tiempo/heartbeat';
    const payload = JSON.stringify({
      session_key: sessionKeyRef.current,
      started_at_ms: st.sessionStartedAtMs,
      active_ms: Math.round(st.activeMs),
      paused_ms: Math.round(st.pausedMs),
      state: final ? 'finalizada' : st.isPaused ? 'pausada' : 'activa',
      fecha_dia: formatLocalDateYYYYMMDD(st.sessionStartedAtMs),
    });

    try {
      if (keepalive && typeof fetch === 'function') {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        await fetch(endpoint, {
          method: 'POST',
          keepalive: true,
          credentials: 'include',
          headers,
          body: payload,
        });
      } else {
        await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
      }
      lastSyncMsRef.current = Date.now();
    } catch {
      // Silencioso para no interrumpir la experiencia de aprendizaje
    }
  }, []);

  const finalizeTrackedSession = useCallback(async () => {
    if (!TIME_MODULE_ENABLED || !trackedUserIdRef.current) return;
    const env = readEnvironmentState();
    stateRef.current = advanceActiveTime(stateRef.current, {
      nowMs: Date.now(),
      isVisible: env.isVisible,
      hasFocus: env.hasFocus,
    });
    publishSnapshot(stateRef.current);
    await syncToBackend(true, true);
  }, [publishSnapshot, syncToBackend]);

  const setTrackedUserId = useCallback(
    (userId: number | null) => {
      if (trackedUserIdRef.current === userId) return;
      if (trackedUserIdRef.current !== null && userId !== trackedUserIdRef.current) {
        void syncToBackend(true, true);
      }

      trackedUserIdRef.current = userId;
      if (userId !== null) {
        const now = Date.now();
        stateRef.current = createActiveTimeState(now);
        sessionKeyRef.current = generateSessionKey();
        publishSnapshot(stateRef.current);
        void syncToBackend(false, false);
      }
    },
    [publishSnapshot, syncToBackend]
  );

  useEffect(() => {
    if (!TIME_MODULE_ENABLED || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const tick = () => {
      const now = Date.now();
      const env = readEnvironmentState();
      const prevPaused = stateRef.current.isPaused;
      const next = advanceActiveTime(stateRef.current, {
        nowMs: now,
        isVisible: env.isVisible,
        hasFocus: env.hasFocus,
      });
      stateRef.current = next;
      publishSnapshot(next);

      if (trackedUserIdRef.current) {
        const stateChanged = prevPaused !== next.isPaused;
        if (stateChanged || now - lastSyncMsRef.current >= 15_000) {
          void syncToBackend(false, false);
        }
      }
    };

    const handleInteraction = () => {
      const now = Date.now();
      const env = readEnvironmentState();
      const prevPaused = stateRef.current.isPaused;
      const next = registerUserInteraction(stateRef.current, now, env);
      stateRef.current = next;
      if (prevPaused && !next.isPaused) {
        publishSnapshot(next);
        if (trackedUserIdRef.current) {
          void syncToBackend(false, false);
        }
      }
    };

    const handleVisibilityOrFocus = () => {
      const now = Date.now();
      const env = readEnvironmentState();
      if (!env.isVisible) {
        stateRef.current = forcePauseActiveTime(stateRef.current, now, 'hidden');
      } else if (!env.hasFocus) {
        stateRef.current = forcePauseActiveTime(stateRef.current, now, 'blur');
      } else {
        stateRef.current = registerUserInteraction(stateRef.current, now, env);
      }
      publishSnapshot(stateRef.current);
      if (trackedUserIdRef.current) {
        void syncToBackend(false, false);
      }
    };

    const handleFreeze = () => {
      stateRef.current = forcePauseActiveTime(stateRef.current, Date.now(), 'suspended');
      publishSnapshot(stateRef.current);
      if (trackedUserIdRef.current) {
        void syncToBackend(false, true);
      }
    };

    const handlePageHide = () => {
      const env = readEnvironmentState();
      stateRef.current = advanceActiveTime(stateRef.current, {
        nowMs: Date.now(),
        isVisible: env.isVisible,
        hasFocus: env.hasFocus,
      });
      publishSnapshot(stateRef.current);
      if (trackedUserIdRef.current) {
        void syncToBackend(true, true);
      }
    };

    const intervalId = window.setInterval(tick, 1000);

    const interactionEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'wheel',
    ] as const;
    for (const ev of interactionEvents) {
      window.addEventListener(ev, handleInteraction, { passive: true });
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('blur', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('freeze', handleFreeze);
    document.addEventListener('resume', handleVisibilityOrFocus);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      for (const ev of interactionEvents) {
        window.removeEventListener(ev, handleInteraction);
      }
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('blur', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('freeze', handleFreeze);
      document.removeEventListener('resume', handleVisibilityOrFocus);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [publishSnapshot, syncToBackend]);

  const actionsValue = useMemo<TimeModuleActionsValue>(
    () => ({
      enabled: TIME_MODULE_ENABLED,
      setTrackedUserId,
      finalizeTrackedSession,
    }),
    [setTrackedUserId, finalizeTrackedSession]
  );

  const value = useMemo<TimeModuleContextValue>(
    () => ({
      enabled: TIME_MODULE_ENABLED,
      sessionStartMs: snapshot.sessionStartMs,
      activeElapsedMs: snapshot.activeElapsedMs,
      pausedElapsedMs: snapshot.pausedElapsedMs,
      isPaused: snapshot.isPaused,
      pauseReason: snapshot.pauseReason,
      sessionKey: snapshot.sessionKey,
      setTrackedUserId,
      finalizeTrackedSession,
    }),
    [snapshot, setTrackedUserId, finalizeTrackedSession]
  );

  if (!TIME_MODULE_ENABLED) {
    return <>{children}</>;
  }

  return (
    <TimeModuleActionsContext.Provider value={actionsValue}>
      <TimeModuleContext.Provider value={value}>{children}</TimeModuleContext.Provider>
    </TimeModuleActionsContext.Provider>
  );
};

export function useTimeModule() {
  return useContext(TimeModuleContext);
}

export function useTimeModuleActions() {
  return useContext(TimeModuleActionsContext);
}

/**
 * Vincula el usuario autenticado con el rastreador de tiempo de sesión.
 */
export const TimeActivitySync: React.FC<{ userId: number | null }> = ({ userId }) => {
  const { setTrackedUserId } = useTimeModuleActions();

  useEffect(() => {
    setTrackedUserId(userId);
  }, [userId, setTrackedUserId]);

  return null;
};

/**
 * Cronómetro por actividad.
 * Inicia cuando `isActive` es verdadero, se detiene cuando `isCompleted` es verdadero
 * y retorna la duración final en milisegundos únicamente al completarse la actividad.
 */
export function useActivityTimer(
  activityKey: string,
  isActive: boolean,
  isCompleted: boolean
): number | null {
  const { enabled } = useTimeModuleActions();
  const prevKeyRef = useRef<string>(activityKey);
  const startMsRef = useRef<number | null>(null);
  const [completedDurationMs, setCompletedDurationMs] = useState<number | null>(null);

  useEffect(() => {
    if (prevKeyRef.current !== activityKey) {
      prevKeyRef.current = activityKey;
      startMsRef.current = null;
      setCompletedDurationMs(null);
    }

    if (!enabled) {
      startMsRef.current = null;
      return;
    }

    if (isCompleted) {
      if (startMsRef.current !== null) {
        const elapsed = Math.max(0, Date.now() - startMsRef.current);
        startMsRef.current = null;
        setCompletedDurationMs(elapsed);
      }
      return;
    }

    if (isActive && startMsRef.current === null) {
      startMsRef.current = Date.now();
    }
  }, [enabled, activityKey, isActive, isCompleted]);

  if (!enabled) return null;
  return completedDurationMs;
}

export function formatClockDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatReadableDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec === 0) return '0 s';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours} h ${minutes} min ${seconds} s`;
  }
  if (minutes > 0) {
    return `${minutes} min ${seconds} s`;
  }
  return `${seconds} s`;
}
