import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock, Settings, X } from 'lucide-react';
import {
  computeSessionLimitStatus,
  loadStoredSessionLimit,
  parseCustomDurationMs,
  saveStoredSessionLimit,
  SESSION_LIMIT_WARNING_MS,
} from '../lib/sessionLimit';
import { formatClockDuration } from '../context/TimeModuleContext';

interface SessionLimitContextValue {
  endsAtMs: number | null;
  totalDurationMs: number | null;
  isConfigOpen: boolean;
  warningActive: boolean;
  warningDismissed: boolean;
  openConfig: () => void;
  closeConfig: () => void;
  setLimitDurationMs: (durationMs: number) => void;
  clearLimit: () => void;
  dismissWarning: () => void;
}

const SessionLimitContext = createContext<SessionLimitContextValue | null>(null);

interface SessionLimitProviderProps {
  userId: number;
  autoOpenSetup: boolean;
  onAutoOpenHandled: () => void;
  onExpire: () => void;
  children: React.ReactNode;
}

export const SessionLimitProvider: React.FC<SessionLimitProviderProps> = ({
  userId,
  autoOpenSetup,
  onAutoOpenHandled,
  onExpire,
  children,
}) => {
  const [endsAtMs, setEndsAtMs] = useState<number | null>(null);
  const [totalDurationMs, setTotalDurationMs] = useState<number | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [warningActive, setWarningActive] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const expiredTriggeredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Cargar límite guardado para el usuario actual al iniciar o recargar
  useEffect(() => {
    expiredTriggeredRef.current = false;
    const stored = loadStoredSessionLimit(userId);
    if (stored) {
      const status = computeSessionLimitStatus(stored.endsAtMs, Date.now());
      if (status.isExpired) {
        saveStoredSessionLimit(null);
        setEndsAtMs(null);
        setTotalDurationMs(null);
        setWarningActive(false);
        expiredTriggeredRef.current = true;
        onExpireRef.current();
        return;
      }
      setEndsAtMs(stored.endsAtMs);
      setTotalDurationMs(stored.totalDurationMs);
      setWarningActive(status.shouldWarn);
      setWarningDismissed(false);
    } else {
      setEndsAtMs(null);
      setTotalDurationMs(null);
      setWarningActive(false);
      setWarningDismissed(false);
    }
  }, [userId]);

  // Abrir automáticamente el configurador después de iniciar sesión
  useEffect(() => {
    if (autoOpenSetup) {
      setIsConfigOpen(true);
      onAutoOpenHandled();
    }
  }, [autoOpenSetup, onAutoOpenHandled]);

  // Vigilar umbral de 1 min 30 s y vencimiento sin re-renderizar en cada segundo
  useEffect(() => {
    if (endsAtMs === null) {
      setWarningActive(false);
      return;
    }

    const evaluate = () => {
      const status = computeSessionLimitStatus(endsAtMs, Date.now());
      if (status.isExpired) {
        if (!expiredTriggeredRef.current) {
          expiredTriggeredRef.current = true;
          saveStoredSessionLimit(null);
          setEndsAtMs(null);
          setTotalDurationMs(null);
          setWarningActive(false);
          setIsConfigOpen(false);
          onExpireRef.current();
        }
        return;
      }
      setWarningActive((prev) => (prev === status.shouldWarn ? prev : status.shouldWarn));
    };

    evaluate();
    const intervalId = window.setInterval(evaluate, 500);
    return () => window.clearInterval(intervalId);
  }, [endsAtMs]);

  const openConfig = useCallback(() => setIsConfigOpen(true), []);
  const closeConfig = useCallback(() => setIsConfigOpen(false), []);

  const setLimitDurationMs = useCallback(
    (durationMs: number) => {
      const nextEndsAt = Date.now() + durationMs;
      expiredTriggeredRef.current = false;
      saveStoredSessionLimit({
        userId,
        endsAtMs: nextEndsAt,
        totalDurationMs: durationMs,
      });
      setEndsAtMs(nextEndsAt);
      setTotalDurationMs(durationMs);
      setWarningDismissed(false);
      setWarningActive(durationMs <= SESSION_LIMIT_WARNING_MS);
      setIsConfigOpen(false);
    },
    [userId]
  );

  const clearLimit = useCallback(() => {
    saveStoredSessionLimit(null);
    expiredTriggeredRef.current = false;
    setEndsAtMs(null);
    setTotalDurationMs(null);
    setWarningActive(false);
    setWarningDismissed(false);
    setIsConfigOpen(false);
  }, []);

  const dismissWarning = useCallback(() => setWarningDismissed(true), []);

  const value = useMemo<SessionLimitContextValue>(
    () => ({
      endsAtMs,
      totalDurationMs,
      isConfigOpen,
      warningActive,
      warningDismissed,
      openConfig,
      closeConfig,
      setLimitDurationMs,
      clearLimit,
      dismissWarning,
    }),
    [
      endsAtMs,
      totalDurationMs,
      isConfigOpen,
      warningActive,
      warningDismissed,
      openConfig,
      closeConfig,
      setLimitDurationMs,
      clearLimit,
      dismissWarning,
    ]
  );

  return <SessionLimitContext.Provider value={value}>{children}</SessionLimitContext.Provider>;
};

export function useSessionLimit() {
  return useContext(SessionLimitContext);
}

const LiveCountdownText: React.FC<{ endsAtMs: number }> = ({ endsAtMs }) => {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, endsAtMs - Date.now()));

  useEffect(() => {
    setRemainingMs(Math.max(0, endsAtMs - Date.now()));
    const id = window.setInterval(() => {
      setRemainingMs(Math.max(0, endsAtMs - Date.now()));
    }, 500);
    return () => window.clearInterval(id);
  }, [endsAtMs]);

  return <span className="font-mono tabular-nums font-bold">{formatClockDuration(remainingMs)}</span>;
};

/**
 * Aviso visible cuando faltan 1 minuto y 30 segundos (o menos) para cumplirse el tiempo límite.
 */
export const SessionLimitWarningBanner: React.FC = () => {
  const ctx = useSessionLimit();
  if (!ctx || !ctx.warningActive || ctx.warningDismissed || ctx.endsAtMs === null) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-amber-50 border-b border-amber-300 text-amber-950"
    >
      <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
          <p>
            <strong>Aviso de tiempo límite:</strong> quedan{' '}
            <LiveCountdownText endsAtMs={ctx.endsAtMs} /> antes de que tu sesión se cierre
            automáticamente.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={ctx.openConfig}
            className="px-3 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold transition"
          >
            Ampliar o ajustar
          </button>
          <button
            type="button"
            onClick={ctx.dismissWarning}
            aria-label="Ocultar aviso temporalmente"
            className="p-1.5 rounded-lg text-amber-900 hover:bg-amber-200/70 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Control discreto en el pie de página para ver el tiempo restante del límite o configurarlo.
 */
export const SessionLimitFooterControl: React.FC = () => {
  const ctx = useSessionLimit();
  if (!ctx) return null;

  return (
    <div className="inline-flex items-center gap-2 text-xs text-[#444653] tabular-nums">
      {ctx.endsAtMs !== null ? (
        <button
          type="button"
          onClick={ctx.openConfig}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition ${
            ctx.warningActive
              ? 'border-amber-300 bg-amber-50 text-amber-900 font-semibold'
              : 'border-slate-200 bg-[#f7f9fb] hover:border-slate-300 text-[#191c1e]'
          }`}
          title="Configurar tiempo límite de sesión"
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            Límite: <LiveCountdownText endsAtMs={ctx.endsAtMs} />
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={ctx.openConfig}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-[#4f46e5] text-[#444653] hover:text-[#1e40af] transition"
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          <span>Configurar límite de sesión</span>
        </button>
      )}
    </div>
  );
};

const PRESET_MINUTES = [2, 5, 15, 30, 45, 60];

/**
 * Diálogo de configuración del tiempo límite después de iniciar sesión.
 */
export const SessionLimitSetupModal: React.FC = () => {
  const ctx = useSessionLimit();
  const [minutesInput, setMinutesInput] = useState('15');
  const [secondsInput, setSecondsInput] = useState('0');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (ctx?.isConfigOpen) {
      setFormError(null);
      if (ctx.endsAtMs !== null) {
        const remSec = Math.max(1, Math.ceil((ctx.endsAtMs - Date.now()) / 1000));
        setMinutesInput(String(Math.floor(remSec / 60)));
        setSecondsInput(String(remSec % 60));
      } else {
        setMinutesInput('15');
        setSecondsInput('0');
      }
    }
  }, [ctx?.isConfigOpen, ctx?.endsAtMs]);

  if (!ctx || !ctx.isConfigOpen) return null;

  function handlePreset(mins: number) {
    setFormError(null);
    ctx?.setLimitDurationMs(mins * 60 * 1000);
  }

  function handleSubmitCustom(e: React.FormEvent) {
    e.preventDefault();
    const mins = Number(minutesInput);
    const secs = Number(secondsInput || '0');
    const durationMs = parseCustomDurationMs(mins, secs);
    if (!durationMs) {
      setFormError(
        'Ingresa una duración válida mayor a 0 segundos (minutos entre 0 y 480, segundos entre 0 y 59).'
      );
      return;
    }
    setFormError(null);
    ctx?.setLimitDurationMs(durationMs);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-limit-modal-title"
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2
              id="session-limit-modal-title"
              className="font-display text-xl font-bold text-[#191c1e]"
            >
              Tiempo límite de sesión
            </h2>
            <p className="text-xs text-[#444653] leading-relaxed">
              Configura cuánto tiempo durará tu sesión activa. Recibirás un aviso cuando falte{' '}
              <strong>1 min y 30 s</strong> y la sesión se cerrará automáticamente al finalizar.
            </p>
          </div>
          <button
            type="button"
            onClick={ctx.closeConfig}
            aria-label="Cerrar configuración de tiempo límite"
            className="p-1.5 rounded-lg text-[#444653] hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#191c1e]">Opciones rápidas</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_MINUTES.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => handlePreset(mins)}
                className="px-3 py-2 rounded-lg border border-slate-200 hover:border-[#4f46e5] hover:bg-[#eef2ff] text-xs font-semibold text-[#191c1e] tabular-nums transition"
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmitCustom} className="space-y-4 pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-[#191c1e]">Duración personalizada</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="limit-minutes-input"
                className="block text-xs font-medium text-[#444653] mb-1"
              >
                Minutos
              </label>
              <input
                id="limit-minutes-input"
                type="number"
                min={0}
                max={480}
                value={minutesInput}
                onChange={(e) => setMinutesInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-[#191c1e] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
              />
            </div>

            <div>
              <label
                htmlFor="limit-seconds-input"
                className="block text-xs font-medium text-[#444653] mb-1"
              >
                Segundos
              </label>
              <input
                id="limit-seconds-input"
                type="number"
                min={0}
                max={59}
                value={secondsInput}
                onChange={(e) => setSecondsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-[#191c1e] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-xs text-[#ba1a1a]">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {ctx.endsAtMs !== null ? (
              <button
                type="button"
                onClick={ctx.clearLimit}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-[#ba1a1a] hover:bg-rose-50 transition"
              >
                Desactivar límite
              </button>
            ) : (
              <button
                type="button"
                onClick={ctx.closeConfig}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-[#444653] hover:bg-slate-100 transition"
              >
                Omitir por ahora
              </button>
            )}

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold transition"
            >
              Iniciar cronómetro
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
