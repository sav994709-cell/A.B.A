import React from 'react';
import { Clock, PauseCircle } from 'lucide-react';
import {
  formatClockDuration,
  formatReadableDuration,
  useTimeModule,
  useTimeModuleActions,
} from '../context/TimeModuleContext';

/**
 * Contador global de sesión discreto para el pie de página.
 * Muestra el tiempo activo real y se pausa automáticamente cuando la pantalla
 * se apaga, se oculta o no hay interacción detectada.
 */
export const GlobalSessionTimer: React.FC = () => {
  const { enabled, activeElapsedMs, isPaused } = useTimeModule();

  if (!enabled) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-[#444653] tabular-nums"
      aria-label="Tiempo activo de sesión"
      title={
        isPaused
          ? 'Temporizador pausado automáticamente por pantalla oculta o inactividad'
          : 'Tiempo activo en la plataforma'
      }
    >
      {isPaused ? (
        <PauseCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      ) : (
        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      )}
      <span>
        Sesión: {formatClockDuration(activeElapsedMs)}
        {isPaused ? ' (pausado)' : ''}
      </span>
    </span>
  );
};

interface ActivityTimeSummaryProps {
  durationMs: number | null;
  label?: string;
}

/**
 * Resumen discreto del tiempo empleado en una actividad.
 * Solo se muestra cuando existe un tiempo finalizado (`durationMs !== null`).
 */
export const ActivityTimeSummary: React.FC<ActivityTimeSummaryProps> = ({
  durationMs,
  label = 'Tiempo empleado en esta actividad',
}) => {
  const { enabled } = useTimeModuleActions();

  if (!enabled || durationMs === null) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-[#444653] tabular-nums pt-1">
      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span>
        {label}: <strong className="font-semibold text-[#191c1e]">{formatReadableDuration(durationMs)}</strong>
      </span>
    </div>
  );
};
