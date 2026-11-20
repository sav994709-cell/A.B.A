import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Download,
  PauseCircle,
  PlayCircle,
  Printer,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AuthUser } from '../types';
import {
  formatClockDuration,
  formatReadableDuration,
  useTimeModule,
} from '../context/TimeModuleContext';

interface SessionRow {
  id_sesion: number;
  id_usuario: number;
  usuario_nombre: string;
  usuario_email: string;
  nombre_rol: string;
  fecha_dia: string;
  inicio_ms: number;
  fin_ms: number;
  duracion_activa_ms: number;
  pausas_ms: number;
  estado: 'activa' | 'pausada' | 'finalizada';
}

interface DailyStat {
  fecha_dia: string;
  sesiones: number;
  duracion_activa_ms: number;
  pausas_ms: number;
}

interface UserSummary {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  nombre_rol: string;
  sesiones: number;
  tiempo_total_activo_ms: number;
  tiempo_pausado_ms: number;
  tiempo_promedio_ms: number;
  ultima_conexion_ms: number;
}

interface TimeReportPayload {
  es_admin: boolean;
  filtro_usuario_id: number | null;
  desde: string | null;
  hasta: string | null;
  estadisticas: {
    total_sesiones: number;
    tiempo_total_activo_ms: number;
    tiempo_promedio_sesion_ms: number;
    tiempo_pausado_ms: number;
    dias_activos: number;
    porcentaje_actividad: number;
    fecha_pico: string | null;
    serie_diaria: DailyStat[];
  };
  sesiones: SessionRow[];
  usuarios_resumen?: UserSummary[];
  usuarios_filtro?: Array<{
    id_usuario: number;
    nombre: string;
    apellido: string;
    email: string;
    nombre_rol: string;
  }>;
}

function formatTimeOfDay(epochMs: number): string {
  if (!epochMs) return '—';
  const d = new Date(epochMs);
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeCsvCell(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const TimeHistoryView: React.FC<{ user: AuthUser }> = ({ user }) => {
  const isAdmin = user.nombre_rol === 'Administrador';
  const { activeElapsedMs, pausedElapsedMs, isPaused, pauseReason } = useTimeModule();

  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [report, setReport] = useState<TimeReportPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set('desde', desde);
      if (hasta) qs.set('hasta', hasta);
      if (isAdmin && selectedUserId) qs.set('id_usuario', selectedUserId);
      const query = qs.toString();
      const res = await apiFetch(`/api/tiempo/historial${query ? `?${query}` : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el historial de tiempo.');
      setReport(data as TimeReportPayload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, isAdmin, selectedUserId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  function applyPreset(days: number | null) {
    if (days === null) {
      setDesde('');
      setHasta('');
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setDesde(toIsoDate(start));
    setHasta(toIsoDate(end));
  }

  function exportCsv() {
    if (!report) return;
    const headers = [
      'Fecha',
      ...(isAdmin ? ['Usuario', 'Correo', 'Rol'] : []),
      'Hora inicio',
      'Hora fin',
      'Tiempo activo (min)',
      'Tiempo pausado (min)',
      'Estado',
    ];
    const rows = report.sesiones.map((s) => [
      s.fecha_dia,
      ...(isAdmin ? [s.usuario_nombre, s.usuario_email, s.nombre_rol] : []),
      formatTimeOfDay(s.inicio_ms),
      formatTimeOfDay(s.fin_ms),
      (s.duracion_activa_ms / 60000).toFixed(2),
      (s.pausas_ms / 60000).toFixed(2),
      s.estado,
    ]);
    const csvContent =
      '\uFEFF' +
      [headers, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aba-historial-tiempo-${toIsoDate(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const maxDailyMs = useMemo(() => {
    if (!report || report.estadisticas.serie_diaria.length === 0) return 1;
    return Math.max(
      1,
      ...report.estadisticas.serie_diaria.map((d) => d.duracion_activa_ms)
    );
  }, [report]);

  const pauseLabel =
    pauseReason === 'hidden'
      ? 'Pestaña oculta o pantalla apagada'
      : pauseReason === 'blur'
        ? 'Ventana sin foco'
        : pauseReason === 'suspended'
          ? 'Equipo suspendido'
          : pauseReason === 'idle'
            ? 'Inactividad detectada (60 s)'
            : null;

  return (
    <div className="space-y-8">
      {/* Cabecera */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#4f46e5]">
            {isAdmin ? 'Control y Estadísticas de Uso · Vista Administrador' : 'Registro Personal de Conexión'}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-[#191c1e]">
            Historial de Tiempo y Actividad
          </h1>
          <p className="mt-1 text-sm text-[#444653] max-w-2xl">
            Consulta en qué fechas y horarios has permanecido conectado. El temporizador se detiene automáticamente si la pantalla se apaga, se oculta la ventana o se detecta inactividad.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <button
            type="button"
            onClick={() => void loadReport()}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#191c1e] transition"
          >
            Actualizar
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!report || report.sesiones.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-[#191c1e] transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir reporte</span>
          </button>
        </div>
      </div>

      {/* Estado en vivo de la sesión actual */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isPaused ? (
            <PauseCircle className="w-5 h-5 text-amber-600 shrink-0" />
          ) : (
            <PlayCircle className="w-5 h-5 text-[#047857] shrink-0" />
          )}
          <div>
            <p className="text-sm font-semibold text-[#191c1e]">
              {isPaused ? 'Temporizador de sesión en pausa automática' : 'Sesión actual registrando tiempo activo'}
            </p>
            <p className="text-xs text-[#444653]">
              {isPaused && pauseLabel
                ? `Motivo: ${pauseLabel}. Se reanudará al volver a interactuar.`
                : 'Se detiene de inmediato si cambias de pestaña, apagas la pantalla o pasas 60 s sin actividad.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 tabular-nums text-xs">
          <div>
            <span className="block text-[#444653]">Activo ahora</span>
            <strong className="font-mono-num text-base font-bold text-[#1e40af]">
              {formatClockDuration(activeElapsedMs)}
            </strong>
          </div>
          <div>
            <span className="block text-[#444653]">En pausa</span>
            <strong className="font-mono-num text-base font-semibold text-[#444653]">
              {formatClockDuration(pausedElapsedMs)}
            </strong>
          </div>
        </div>
      </section>

      {/* Filtros de fecha y usuario */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation space-y-4 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="time-desde" className="block text-xs font-semibold text-[#444653] mb-1">
              Desde
            </label>
            <input
              id="time-desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="time-hasta" className="block text-xs font-semibold text-[#444653] mb-1">
              Hasta
            </label>
            <input
              id="time-hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
            />
          </div>

          {isAdmin && report?.usuarios_filtro && (
            <div className="min-w-[220px]">
              <label htmlFor="time-user-select" className="block text-xs font-semibold text-[#444653] mb-1">
                Filtrar por usuario
              </label>
              <select
                id="time-user-select"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
              >
                <option value="">Todos los usuarios</option>
                {report.usuarios_filtro.map((u) => (
                  <option key={u.id_usuario} value={u.id_usuario}>
                    {u.nombre} {u.apellido} ({u.nombre_rol})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => applyPreset(7)}
              className="px-3 py-2 rounded-lg bg-[#f2f4f6] hover:bg-slate-200 text-xs font-semibold text-[#191c1e] transition"
            >
              7 días
            </button>
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className="px-3 py-2 rounded-lg bg-[#f2f4f6] hover:bg-slate-200 text-xs font-semibold text-[#191c1e] transition"
            >
              30 días
            </button>
            <button
              type="button"
              onClick={() => {
                applyPreset(null);
                setSelectedUserId('');
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-[#444653] transition"
            >
              Todo
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-white border border-red-200 rounded-2xl p-6 text-sm text-[#ba1a1a]">
          {error}
        </div>
      )}

      {loading && !report ? (
        <div className="py-12 text-center text-sm text-[#444653]">
          Cargando historial y estadísticas de tiempo...
        </div>
      ) : report ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation">
              <div className="flex items-center justify-between text-xs font-semibold text-[#444653]">
                <span>Tiempo Activo Total</span>
                <Clock className="w-4 h-4 text-[#4f46e5]" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-[#191c1e] tabular-nums">
                {formatReadableDuration(report.estadisticas.tiempo_total_activo_ms)}
              </p>
              <p className="mt-1 text-xs text-[#444653] tabular-nums">
                En {report.estadisticas.dias_activos} día(s) con actividad
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation">
              <div className="flex items-center justify-between text-xs font-semibold text-[#444653]">
                <span>Sesiones Registradas</span>
                <Calendar className="w-4 h-4 text-[#1e40af]" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-[#191c1e] tabular-nums">
                {report.estadisticas.total_sesiones}
              </p>
              <p className="mt-1 text-xs text-[#444653] tabular-nums">
                Promedio por sesión:{' '}
                {formatReadableDuration(report.estadisticas.tiempo_promedio_sesion_ms)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation">
              <div className="flex items-center justify-between text-xs font-semibold text-[#444653]">
                <span>Tiempo en Pausa</span>
                <PauseCircle className="w-4 h-4 text-amber-600" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-[#191c1e] tabular-nums">
                {formatReadableDuration(report.estadisticas.tiempo_pausado_ms)}
              </p>
              <p className="mt-1 text-xs text-[#444653] tabular-nums">
                Actividad efectiva: {report.estadisticas.porcentaje_actividad}%
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation">
              <div className="flex items-center justify-between text-xs font-semibold text-[#444653]">
                <span>Día de Mayor Actividad</span>
                <Users className="w-4 h-4 text-[#047857]" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-[#191c1e] font-mono-num">
                {report.estadisticas.fecha_pico || 'Sin datos'}
              </p>
              <p className="mt-1 text-xs text-[#444653]">
                {report.filtro_usuario_id
                  ? 'Filtro aplicado a un usuario'
                  : isAdmin
                    ? 'Consolidado de toda la plataforma'
                    : 'Tus sesiones registradas'}
              </p>
            </div>
          </div>

          {/* Gráfica diaria SVG */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                  Distribución Diaria de Tiempo Activo
                </h2>
                <p className="text-xs text-[#444653]">
                  Cada barra representa el tiempo efectivo trabajado en esa fecha (excluyendo pausas por pantalla apagada o inactividad).
                </p>
              </div>
              <span className="text-xs text-[#444653] tabular-nums">
                {report.estadisticas.serie_diaria.length} fecha(s)
              </span>
            </div>

            {report.estadisticas.serie_diaria.length === 0 ? (
              <p className="py-6 text-sm text-[#444653]">
                No hay registros de tiempo en el rango de fechas seleccionado.
              </p>
            ) : (
              <div className="space-y-2.5 pt-2">
                {report.estadisticas.serie_diaria.slice(-14).map((day) => {
                  const pct = Math.max(
                    3,
                    Math.round((day.duracion_activa_ms / maxDailyMs) * 100)
                  );
                  return (
                    <div
                      key={day.fecha_dia}
                      className="grid grid-cols-[96px_1fr_140px] items-center gap-3 text-xs"
                    >
                      <span className="font-mono-num font-semibold text-[#191c1e]">
                        {day.fecha_dia}
                      </span>
                      <div className="h-5 bg-[#f2f4f6] rounded-md overflow-hidden">
                        <div
                          className="h-full bg-[#4f46e5] rounded-md transition-all"
                          style={{ width: `${pct}%` }}
                          title={`${day.fecha_dia}: ${formatReadableDuration(day.duracion_activa_ms)} activo`}
                        />
                      </div>
                      <span className="font-mono-num text-right text-[#444653]">
                        {formatReadableDuration(day.duracion_activa_ms)} · {day.sesiones} ses.
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Resumen por usuario (solo Administrador) */}
          {isAdmin && report.usuarios_resumen && report.usuarios_resumen.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                    Resumen de Uso por Usuario
                  </h2>
                  <p className="text-xs text-[#444653]">
                    Haz clic en un usuario para inspeccionar el detalle horario de sus conexiones.
                  </p>
                </div>
                <span className="text-xs text-[#444653] tabular-nums">
                  {report.usuarios_resumen.length} usuario(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Usuario</th>
                      <th className="px-6 py-3 font-semibold">Rol</th>
                      <th className="px-6 py-3 font-semibold">Sesiones</th>
                      <th className="px-6 py-3 font-semibold">Tiempo Activo</th>
                      <th className="px-6 py-3 font-semibold">Promedio / Sesión</th>
                      <th className="px-6 py-3 font-semibold">Tiempo Pausado</th>
                      <th className="px-6 py-3 font-semibold text-right print:hidden">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.usuarios_resumen.map((u) => (
                      <tr key={u.id_usuario} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5">
                          <div className="font-medium text-[#191c1e]">
                            {u.nombre} {u.apellido}
                          </div>
                          <div className="text-xs text-[#444653]">{u.email}</div>
                        </td>
                        <td className="px-6 py-3.5 text-xs font-semibold text-[#444653]">
                          {u.nombre_rol}
                        </td>
                        <td className="px-6 py-3.5 font-mono-num">{u.sesiones}</td>
                        <td className="px-6 py-3.5 font-mono-num font-semibold text-[#1e40af]">
                          {formatReadableDuration(u.tiempo_total_activo_ms)}
                        </td>
                        <td className="px-6 py-3.5 font-mono-num text-[#444653]">
                          {formatReadableDuration(u.tiempo_promedio_ms)}
                        </td>
                        <td className="px-6 py-3.5 font-mono-num text-[#444653]">
                          {formatReadableDuration(u.tiempo_pausado_ms)}
                        </td>
                        <td className="px-6 py-3.5 text-right print:hidden">
                          <button
                            type="button"
                            onClick={() => setSelectedUserId(String(u.id_usuario))}
                            className="text-xs font-semibold text-[#4f46e5] hover:underline"
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Historial detallado fecha y hora a hora */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                Detalle Cronológico de Sesiones
              </h2>
              <span className="text-xs text-[#444653] tabular-nums">
                {report.sesiones.length} sesión(es)
              </span>
            </div>

            {report.sesiones.length === 0 ? (
              <p className="p-6 text-sm text-[#444653]">
                No existen sesiones registradas para los filtros seleccionados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Fecha</th>
                      {isAdmin && <th className="px-6 py-3 font-semibold">Usuario</th>}
                      <th className="px-6 py-3 font-semibold">Horario (Inicio – Fin)</th>
                      <th className="px-6 py-3 font-semibold">Tiempo Activo</th>
                      <th className="px-6 py-3 font-semibold">Tiempo Pausado</th>
                      <th className="px-6 py-3 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.sesiones.map((s) => (
                      <tr key={s.id_sesion} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5 font-mono-num font-semibold text-[#191c1e]">
                          {s.fecha_dia}
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-3.5">
                            <span className="font-medium text-[#191c1e]">{s.usuario_nombre}</span>
                            <span className="block text-xs text-[#444653]">{s.nombre_rol}</span>
                          </td>
                        )}
                        <td className="px-6 py-3.5 font-mono-num text-[#191c1e]">
                          {formatTimeOfDay(s.inicio_ms)} – {formatTimeOfDay(s.fin_ms)}
                        </td>
                        <td className="px-6 py-3.5 font-mono-num font-semibold text-[#047857]">
                          {formatReadableDuration(s.duracion_activa_ms)}
                        </td>
                        <td className="px-6 py-3.5 font-mono-num text-[#444653]">
                          {formatReadableDuration(s.pausas_ms)}
                        </td>
                        <td className="px-6 py-3.5 text-xs font-semibold">
                          {s.estado === 'activa' ? (
                            <span className="text-[#047857]">Activa</span>
                          ) : s.estado === 'pausada' ? (
                            <span className="text-amber-700">En pausa</span>
                          ) : (
                            <span className="text-[#444653]">Finalizada</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
};
