export type PauseReason = 'hidden' | 'blur' | 'suspended' | 'idle' | null;

export interface ActiveTimeState {
  sessionStartedAtMs: number;
  lastTickMs: number;
  lastInteractionMs: number;
  activeMs: number;
  pausedMs: number;
  isPaused: boolean;
  pauseReason: PauseReason;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
export const DEFAULT_SLEEP_GAP_MS = 5_000;

export function createActiveTimeState(nowMs: number): ActiveTimeState {
  return {
    sessionStartedAtMs: nowMs,
    lastTickMs: nowMs,
    lastInteractionMs: nowMs,
    activeMs: 0,
    pausedMs: 0,
    isPaused: false,
    pauseReason: null,
  };
}

export function advanceActiveTime(
  state: ActiveTimeState,
  params: {
    nowMs: number;
    isVisible: boolean;
    hasFocus: boolean;
    idleTimeoutMs?: number;
    sleepGapMs?: number;
  }
): ActiveTimeState {
  const idleTimeoutMs = params.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const sleepGapMs = params.sleepGapMs ?? DEFAULT_SLEEP_GAP_MS;
  const delta = Math.max(0, params.nowMs - state.lastTickMs);

  let nextPauseReason: PauseReason = null;
  if (!params.isVisible) {
    nextPauseReason = 'hidden';
  } else if (!params.hasFocus) {
    nextPauseReason = 'blur';
  } else if (delta > sleepGapMs) {
    nextPauseReason = 'suspended';
  } else if (params.nowMs - state.lastInteractionMs >= idleTimeoutMs) {
    nextPauseReason = 'idle';
  }

  // Si hubo un salto prolongado (pantalla apagada / equipo suspendido), ese intervalo no cuenta como tiempo activo.
  if (state.isPaused || delta > sleepGapMs || nextPauseReason === 'hidden' || nextPauseReason === 'blur') {
    return {
      ...state,
      lastTickMs: params.nowMs,
      pausedMs: state.pausedMs + delta,
      isPaused: nextPauseReason !== null,
      pauseReason: nextPauseReason,
    };
  }

  if (nextPauseReason === 'idle') {
    // Si recién cruzó el umbral de inactividad, solo acreditamos hasta el límite de inactividad si hubiera residuo.
    const activeCutoff = Math.min(params.nowMs, state.lastInteractionMs + idleTimeoutMs);
    const activePortion = Math.max(0, activeCutoff - state.lastTickMs);
    const idlePortion = Math.max(0, delta - activePortion);
    return {
      ...state,
      lastTickMs: params.nowMs,
      activeMs: state.activeMs + activePortion,
      pausedMs: state.pausedMs + idlePortion,
      isPaused: true,
      pauseReason: 'idle',
    };
  }

  return {
    ...state,
    lastTickMs: params.nowMs,
    activeMs: state.activeMs + delta,
    isPaused: false,
    pauseReason: null,
  };
}

export function registerUserInteraction(
  state: ActiveTimeState,
  nowMs: number,
  env: { isVisible: boolean; hasFocus: boolean }
): ActiveTimeState {
  const settled = advanceActiveTime(state, {
    nowMs,
    isVisible: env.isVisible,
    hasFocus: env.hasFocus,
  });

  const canResume = env.isVisible && env.hasFocus;
  return {
    ...settled,
    lastInteractionMs: nowMs,
    isPaused: canResume ? false : settled.isPaused,
    pauseReason: canResume ? null : settled.pauseReason,
  };
}

export function forcePauseActiveTime(
  state: ActiveTimeState,
  nowMs: number,
  reason: Exclude<PauseReason, null>
): ActiveTimeState {
  const delta = Math.max(0, nowMs - state.lastTickMs);
  return {
    ...state,
    lastTickMs: nowMs,
    activeMs: state.isPaused ? state.activeMs : state.activeMs + delta,
    pausedMs: state.isPaused ? state.pausedMs + delta : state.pausedMs,
    isPaused: true,
    pauseReason: reason,
  };
}

export function formatLocalDateYYYYMMDD(epochMs: number): string {
  const d = new Date(epochMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
