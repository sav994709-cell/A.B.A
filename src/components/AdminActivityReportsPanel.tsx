import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Download,
  Info,
  Layers,
  Printer,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

type ReportPeriodPreset = '7d' | '30d' | '90d' | 'all';
type ReportGranularity = 'diaria' | 'semanal' | 'mensual';
type ActivityIntensity = 'power' | 'regular' | 'esporadico' | 'inactivo';

interface AdminActivityReportPayload {
  parametros: {
    periodo: ReportPeriodPreset;
    granularidad: ReportGranularity;
    desde: string | null;
    hasta: string | null;
    id_rol: number | 'all';
    id_grado: number | 'all';
    estado_actividad: ActivityIntensity | 'all';
  };
  resumen_adopcion: {
    usuarios_registrados: number;
    usuarios_activos_periodo: number;
    usuarios_con_valor: number;
    usuarios_inactivos: number;
    tasa_activacion_pct: number;
    tasa_valor_real_pct: number;
    dau_promedio: number;
    wau_actual: number;
    mau_actual: number;
    stickiness_dau_mau_pct: number;
    total_sesiones: number;
    sesiones_por_usuario_activo: number;
    tiempo_activo_total_min: number;
    tiempo_pausado_total_min: number;
    tiempo_promedio_sesion_min: number;
    tasa_atencion_efectiva_pct: number;
    total_eventos_funcionales: number;
  };
  serie_temporal: Array<{
    clave_periodo: string;
    etiqueta: string;
    usuarios_activos: number;
    sesiones: number;
    tiempo_activo_min: number;
    eventos_funcionales: number;
  }>;
  uso_funcionalidades: Array<{
    clave_modulo: string;
    nombre_modulo: string;
    descripcion: string;
    usuarios_unicos: number;
    tasa_adopcion_pct: number;
    eventos_totales: number;
    eventos_por_adoptante: number;
    participacion_eventos_pct: number;
  }>;
  concentracion: {
    indice_pareto_top20_tiempo_pct: number;
    indice_pareto_top20_eventos_pct: number;
    top_20_usuarios_cantidad: number;
    alerta_concentracion: string;
    distribucion_intensidad: Array<{
      nivel: ActivityIntensity;
      etiqueta: string;
      usuarios: number;
      porcentaje: number;
    }>;
    por_rol: Array<{
      segmento: string;
      detalle: string;
      registrados: number;
      activos: number;
      tasa_activacion_pct: number;
      sesiones: number;
      tiempo_activo_min: number;
      eventos_totales: number;
      promedio_tiempo_por_activo_min: number;
    }>;
    por_grado: Array<{
      segmento: string;
      detalle: string;
      registrados: number;
      activos: number;
      tasa_activacion_pct: number;
      sesiones: number;
      tiempo_activo_min: number;
      eventos_totales: number;
      promedio_tiempo_por_activo_min: number;
    }>;
  };
  patrones_temporales: {
    dia_pico: string | null;
    franja_pico: string | null;
    por_dia_semana: Array<{
      dia_indice: number;
      dia_nombre: string;
      sesiones: number;
      tiempo_activo_min: number;
    }>;
    por_franja_horaria: Array<{
      franja: string;
      rango_horas: string;
      sesiones: number;
      tiempo_activo_min: number;
      participacion_sesiones_pct: number;
    }>;
  };
  usuarios_detalle: Array<{
    id_usuario: number;
    nombre_completo: string;
    email: string;
    nombre_rol: string;
    grado_label: string;
    sesiones: number;
    dias_activos: number;
    tiempo_activo_min: number;
    tiempo_pausado_min: number;
    eventos_totales: number;
    modulos_usados: string[];
    tiene_accion_valor: boolean;
    ultima_actividad_fecha: string | null;
    dias_sin_actividad: number | null;
    nivel_intensidad: ActivityIntensity;
  }>;
  criterios_y_errores_comunes: {
    supuestos_plataforma: string[];
    errores_interpretacion: Array<{
      error: string;
      como_evitarlo: string;
    }>;
  };
}

interface TelemetryControlReport {
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
    tasa_perdida_pct: number;
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
}

interface Props {
  roles: Array<{ id_rol: number; nombre_rol: string }>;
  grados: Array<{ id_grado: number; nombre_grado: string; seccion: string | null }>;
}

function escapeCsvCell(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function intensityLabel(level: ActivityIntensity): string {
  if (level === 'power') return 'Intensivo';
  if (level === 'regular') return 'Regular';
  if (level === 'esporadico') return 'Esporádico';
  return 'Sin actividad';
}

function intensityTextClass(level: ActivityIntensity): string {
  if (level === 'power') return 'text-[#1e40af] font-semibold';
  if (level === 'regular') return 'text-[#047857] font-semibold';
  if (level === 'esporadico') return 'text-[#b45309] font-semibold';
  return 'text-[#ba1a1a] font-semibold';
}

export const AdminActivityReportsPanel: React.FC<Props> = ({ roles, grados }) => {
  const [periodo, setPeriodo] = useState<ReportPeriodPreset>('30d');
  const [granularidad, setGranularidad] = useState<ReportGranularity>('diaria');
  const [idRol, setIdRol] = useState<number | 'all'>('all');
  const [idGrado, setIdGrado] = useState<number | 'all'>('all');
  const [estadoActividad, setEstadoActividad] = useState<ActivityIntensity | 'all'>('all');
  const [report, setReport] = useState<AdminActivityReportPayload | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryControlReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('periodo', periodo);
      qs.set('granularidad', granularidad);
      if (idRol !== 'all') qs.set('id_rol', String(idRol));
      if (idGrado !== 'all') qs.set('id_grado', String(idGrado));
      if (estadoActividad !== 'all') qs.set('estado_actividad', estadoActividad);

      const [res, telRes] = await Promise.all([
        apiFetch(`/api/admin/reportes-actividad?${qs.toString()}`),
        apiFetch('/api/admin/telemetria/estado'),
      ]);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No fue posible generar los reportes de uso.');
      setReport(d as AdminActivityReportPayload);

      if (telRes.ok) {
        const t = await telRes.json();
        setTelemetry(t as TelemetryControlReport);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [periodo, granularidad, idRol, idGrado, estadoActividad]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const maxBucketActivity = useMemo(() => {
    if (!report || report.serie_temporal.length === 0) return 1;
    return Math.max(
      1,
      ...report.serie_temporal.map((b) => Math.max(b.usuarios_activos, b.eventos_funcionales))
    );
  }, [report]);

  const maxWeekdaySessions = useMemo(() => {
    if (!report || report.patrones_temporales.por_dia_semana.length === 0) return 1;
    return Math.max(1, ...report.patrones_temporales.por_dia_semana.map((d) => d.sesiones));
  }, [report]);

  function exportCsv() {
    if (!report) return;
    const headers = [
      'Usuario',
      'Correo',
      'Rol',
      'Grado',
      'Nivel de intensidad',
      'Sesiones',
      'Días activos',
      'Tiempo activo (min)',
      'Tiempo pausado (min)',
      'Eventos funcionales',
      'Módulos adoptados',
      'Última actividad',
      'Días sin actividad',
    ];
    const rows = report.usuarios_detalle.map((u) => [
      u.nombre_completo,
      u.email,
      u.nombre_rol,
      u.grado_label,
      intensityLabel(u.nivel_intensidad),
      u.sesiones,
      u.dias_activos,
      u.tiempo_activo_min.toFixed(2),
      u.tiempo_pausado_min.toFixed(2),
      u.eventos_totales,
      u.modulos_usados.join(' / ') || 'Ninguno',
      u.ultima_actividad_fecha ?? 'Nunca',
      u.dias_sin_actividad ?? 'N/A',
    ]);
    const csvContent =
      '\uFEFF' + [headers, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aba-reporte-uso-plataforma-${periodo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Barra de controles y segmentación */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-[#1e40af]">
              Analítica de Uso y Adopción de la Plataforma
            </h2>
            <p className="text-xs text-[#444653] mt-0.5">
              Consola de decisiones sobre adopción real, frecuencia, concentración de uso y acompañamiento.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!report || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#191c1e] whitespace-nowrap shrink-0 disabled:opacity-50 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-xs font-semibold whitespace-nowrap shrink-0 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir reporte</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-[#444653] mb-1">Periodo</label>
            <select
              aria-label="Periodo de análisis"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as ReportPeriodPreset)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#191c1e]"
            >
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
              <option value="all">Todo el histórico</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#444653] mb-1">Granularidad</label>
            <select
              aria-label="Granularidad temporal"
              value={granularidad}
              onChange={(e) => setGranularidad(e.target.value as ReportGranularity)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#191c1e]"
            >
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#444653] mb-1">Rol</label>
            <select
              aria-label="Filtrar por rol"
              value={idRol === 'all' ? 'all' : String(idRol)}
              onChange={(e) => setIdRol(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#191c1e]"
            >
              <option value="all">Todos los roles</option>
              {roles.map((r) => (
                <option key={r.id_rol} value={r.id_rol}>
                  {r.nombre_rol}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#444653] mb-1">Grado / Equipo</label>
            <select
              aria-label="Filtrar por grado"
              value={idGrado === 'all' ? 'all' : String(idGrado)}
              onChange={(e) => setIdGrado(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#191c1e]"
            >
              <option value="all">Todos los grados</option>
              {grados.map((g) => (
                <option key={g.id_grado} value={g.id_grado}>
                  {g.nombre_grado}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#444653] mb-1">Estado de uso</label>
            <select
              aria-label="Filtrar por intensidad"
              value={estadoActividad}
              onChange={(e) => setEstadoActividad(e.target.value as ActivityIntensity | 'all')}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#191c1e]"
            >
              <option value="all">Todos los niveles</option>
              <option value="power">Uso intensivo</option>
              <option value="regular">Uso regular</option>
              <option value="esporadico">Uso esporádico</option>
              <option value="inactivo">Sin actividad</option>
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]">
          {error}
        </div>
      )}

      {loading && !report ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-[#444653]">
          Calculando métricas de adopción, funcionalidades y patrones de uso...
        </div>
      ) : report ? (
        <>
          {/* 01. Reporte de Adopción, Frecuencia y Valor Real */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#191c1e]">
                  01. Adopción, Frecuencia y Recurrencia (Registrados vs. Activos)
                </h3>
                <p className="text-xs text-[#444653]">
                  Responde qué proporción de las cuentas creadas utiliza la plataforma y con qué recurrencia regresa.
                </p>
              </div>
              <span className="text-xs text-[#444653] tabular-nums">
                {report.parametros.desde
                  ? `Ventana: ${report.parametros.desde} a ${report.parametros.hasta}`
                  : 'Ventana: Histórico completo'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
                <p className="text-xs font-semibold text-[#444653]">Activación en el periodo</p>
                <p className="font-display text-2xl font-bold text-[#1e40af] tabular-nums">
                  {report.resumen_adopcion.tasa_activacion_pct}%
                </p>
                <p className="text-xs text-[#444653] tabular-nums">
                  {report.resumen_adopcion.usuarios_activos_periodo} activos de{' '}
                  {report.resumen_adopcion.usuarios_registrados} registrados · Con acción de valor:{' '}
                  {report.resumen_adopcion.usuarios_con_valor} ({report.resumen_adopcion.tasa_valor_real_pct}%)
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
                <p className="text-xs font-semibold text-[#444653]">Recurrencia (DAU / WAU / MAU)</p>
                <p className="font-display text-2xl font-bold text-[#191c1e] tabular-nums">
                  {report.resumen_adopcion.stickiness_dau_mau_pct}% stickiness
                </p>
                <p className="text-xs text-[#444653] tabular-nums">
                  DAU prom: {report.resumen_adopcion.dau_promedio} · WAU: {report.resumen_adopcion.wau_actual} · MAU:{' '}
                  {report.resumen_adopcion.mau_actual}
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
                <p className="text-xs font-semibold text-[#444653]">Sesiones y Tiempo Activo</p>
                <p className="font-display text-2xl font-bold text-[#047857] tabular-nums">
                  {report.resumen_adopcion.tiempo_activo_total_min} min
                </p>
                <p className="text-xs text-[#444653] tabular-nums">
                  {report.resumen_adopcion.total_sesiones} sesiones ({report.resumen_adopcion.sesiones_por_usuario_activo} / activo) · Prom:{' '}
                  {report.resumen_adopcion.tiempo_promedio_sesion_min} min
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
                <p className="text-xs font-semibold text-[#444653]">Actividad Funcional y Atención</p>
                <p className="font-display text-2xl font-bold text-[#4f46e5] tabular-nums">
                  {report.resumen_adopcion.total_eventos_funcionales} eventos
                </p>
                <p className="text-xs text-[#444653] tabular-nums">
                  Atención efectiva: {report.resumen_adopcion.tasa_atencion_efectiva_pct}% · Inactivos:{' '}
                  {report.resumen_adopcion.usuarios_inactivos}
                </p>
              </div>
            </div>

            {/* Evolución temporal */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#1e40af]" />
                  <h4 className="text-sm font-semibold text-[#191c1e]">
                    Evolución de Actividad ({granularidad})
                  </h4>
                </div>
                <span className="text-xs text-[#444653] tabular-nums">
                  {report.serie_temporal.length} corte(s) con movimiento
                </span>
              </div>

              {report.serie_temporal.length === 0 ? (
                <p className="text-sm text-[#444653] py-4">
                  No se registraron sesiones ni eventos funcionales en el periodo y segmento seleccionados.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {report.serie_temporal.map((b) => {
                    const widthPct = Math.max(
                      6,
                      Math.round((Math.max(b.usuarios_activos, b.eventos_funcionales) / maxBucketActivity) * 100)
                    );
                    return (
                      <div key={b.clave_periodo} className="grid grid-cols-12 items-center gap-3 text-xs">
                        <span className="col-span-3 sm:col-span-2 font-mono text-[#191c1e] tabular-nums">
                          {b.etiqueta}
                        </span>
                        <div className="col-span-5 sm:col-span-6 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#4f46e5] rounded-full transition-all"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="col-span-4 text-right text-[#444653] tabular-nums">
                          {b.usuarios_activos} usr · {b.sesiones} ses · {b.eventos_funcionales} ev ·{' '}
                          {b.tiempo_activo_min}m
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* 02. Reporte de Uso y Adopción por Funcionalidad */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#1e40af]" />
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#191c1e]">
                    02. Uso y Adopción por Funcionalidad
                  </h3>
                  <p className="text-xs text-[#444653]">
                    Identifica qué módulos impulsan el valor diario y cuáles requieren mayor visibilidad o capacitación.
                  </p>
                </div>
              </div>
              <span className="text-xs text-[#444653] tabular-nums">
                Base adopción: {report.resumen_adopcion.usuarios_activos_periodo} usuarios activos
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f7f9fb] text-xs text-[#444653] border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Funcionalidad / Módulo</th>
                    <th className="px-5 py-3 font-semibold text-right">Usuarios únicos</th>
                    <th className="px-5 py-3 font-semibold text-right">Adopción s/ activos</th>
                    <th className="px-5 py-3 font-semibold text-right">Eventos totales</th>
                    <th className="px-5 py-3 font-semibold text-right">Eventos / adoptante</th>
                    <th className="px-5 py-3 font-semibold text-right">Peso en actividad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.uso_funcionalidades.map((m) => (
                    <tr key={m.clave_modulo} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-[#191c1e]">{m.nombre_modulo}</p>
                        <p className="text-xs text-[#444653]">{m.descripcion}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-[#191c1e]">
                        {m.usuarios_unicos}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-[#1e40af] font-semibold">
                        {m.tasa_adopcion_pct}%
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-[#191c1e]">
                        {m.eventos_totales}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-[#444653]">
                        {m.eventos_por_adoptante}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono tabular-nums text-[#444653]">
                        {m.participacion_eventos_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 03. Concentración Pareto y Segmentación por Rol y Grado */}
          <section className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#191c1e]">
                03. Concentración de Actividad (Pareto 80/20) y Comparativa por Segmento
              </h3>
              <p className="text-xs text-[#444653]">
                Detecta si el uso depende de pocos usuarios intensivos y compara adopción entre roles y grados.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-[#191c1e]">
                      Índice de Concentración (Top 20% = {report.concentracion.top_20_usuarios_cantidad} usuarios)
                    </h4>
                    <p className="text-xs text-[#444653] mt-1 leading-relaxed">
                      {report.concentracion.alerta_concentracion}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-[#444653]">Peso Top 20% en tiempo</p>
                    <p className="font-display text-xl font-bold text-[#191c1e] tabular-nums">
                      {report.concentracion.indice_pareto_top20_tiempo_pct}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#444653]">Peso Top 20% en eventos</p>
                    <p className="font-display text-xl font-bold text-[#191c1e] tabular-nums">
                      {report.concentracion.indice_pareto_top20_eventos_pct}%
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-[#444653]">Distribución por intensidad de uso</p>
                  {report.concentracion.distribucion_intensidad.map((d) => (
                    <div key={d.nivel} className="flex items-center justify-between text-xs">
                      <span className="text-[#191c1e]">{d.etiqueta}</span>
                      <span className="font-mono tabular-nums text-[#444653]">
                        {d.usuarios} ({d.porcentaje}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#1e40af]" />
                  <h4 className="text-sm font-semibold text-[#191c1e]">Segmentación por Rol y Grado</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f7f9fb] text-[#444653] border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Rol / Segmento</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Activos / Reg.</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Activación</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Sesiones</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Tiempo (min)</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Eventos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.concentracion.por_rol.map((r) => (
                        <tr key={`rol-${r.segmento}`} className="bg-indigo-50/30">
                          <td className="px-4 py-2.5 font-semibold text-[#1e40af]">Rol: {r.segmento}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {r.activos} / {r.registrados}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">
                            {r.tasa_activacion_pct}%
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.sesiones}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.tiempo_activo_min}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.eventos_totales}</td>
                        </tr>
                      ))}
                      {report.concentracion.por_grado.map((g) => (
                        <tr key={`grado-${g.segmento}`}>
                          <td className="px-4 py-2.5 font-medium text-[#191c1e]">{g.segmento}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {g.activos} / {g.registrados}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {g.tasa_activacion_pct}%
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{g.sesiones}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{g.tiempo_activo_min}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">{g.eventos_totales}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* 04. Patrones Temporales */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#1e40af]" />
                  <h3 className="font-display text-base font-semibold text-[#191c1e]">
                    04. Patrones por Día de la Semana
                  </h3>
                </div>
                <span className="text-xs text-[#444653]">
                  Día pico: <strong className="text-[#1e40af]">{report.patrones_temporales.dia_pico ?? 'Sin datos'}</strong>
                </span>
              </div>
              <div className="space-y-2.5">
                {report.patrones_temporales.por_dia_semana.map((d) => {
                  const pct = d.sesiones > 0 ? Math.max(6, Math.round((d.sesiones / maxWeekdaySessions) * 100)) : 0;
                  return (
                    <div key={d.dia_indice} className="grid grid-cols-12 items-center gap-3 text-xs">
                      <span className="col-span-3 font-medium text-[#191c1e]">{d.dia_nombre}</span>
                      <div className="col-span-5 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1e40af] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="col-span-4 text-right font-mono tabular-nums text-[#444653]">
                        {d.sesiones} ses · {d.tiempo_activo_min}m
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-[#191c1e]">
                  Distribución por Franja Horaria
                </h3>
                <span className="text-xs text-[#444653]">
                  Pico: <strong className="text-[#047857]">{report.patrones_temporales.franja_pico ?? 'Sin datos'}</strong>
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {report.patrones_temporales.por_franja_horaria.map((f) => (
                  <div key={f.franja} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-[#191c1e]">{f.franja}</p>
                      <p className="text-[#444653] tabular-nums">{f.rango_horas}</p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="font-semibold text-[#191c1e]">
                        {f.sesiones} sesiones ({f.participacion_sesiones_pct}%)
                      </p>
                      <p className="text-[#444653]">{f.tiempo_activo_min} min activos</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 05. Detalle accionable de usuarios (acompañamiento y retención) */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#191c1e]">
                  05. Seguimiento Individual de Cuentas y Riesgo de Inactividad
                </h3>
                <p className="text-xs text-[#444653]">
                  Identifica cuentas sin actividad o con sesiones sin valor completado para activar acompañamiento.
                </p>
              </div>
              <span className="text-xs text-[#444653] tabular-nums">
                {report.usuarios_detalle.length} usuario(s) mostrados
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f7f9fb] text-[#444653] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Usuario</th>
                    <th className="px-4 py-3 font-semibold">Rol / Grado</th>
                    <th className="px-4 py-3 font-semibold">Intensidad</th>
                    <th className="px-4 py-3 font-semibold text-right">Sesiones</th>
                    <th className="px-4 py-3 font-semibold text-right">Días act.</th>
                    <th className="px-4 py-3 font-semibold text-right">Activo / Pausa</th>
                    <th className="px-4 py-3 font-semibold text-right">Eventos</th>
                    <th className="px-4 py-3 font-semibold">Última actividad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.usuarios_detalle.map((u) => (
                    <tr key={u.id_usuario} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#191c1e]">{u.nombre_completo}</p>
                        <p className="text-[#444653]">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 text-[#444653]">
                        {u.nombre_rol} · {u.grado_label}
                      </td>
                      <td className={`px-4 py-3 ${intensityTextClass(u.nivel_intensidad)}`}>
                        {intensityLabel(u.nivel_intensidad)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{u.sesiones}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{u.dias_activos}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {u.tiempo_activo_min}m / {u.tiempo_pausado_min}m
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                        {u.eventos_totales}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-[#444653]">
                        {u.ultima_actividad_fecha
                          ? `${u.ultima_actividad_fecha} (hace ${u.dias_sin_actividad}d)`
                          : 'Sin actividad'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 06. Integridad y Salud del Pipeline de Telemetría */}
          {telemetry && (
            <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#191c1e]">
                    06. Telemetría Automática, Idempotencia y Control de Pérdidas
                  </h3>
                  <p className="text-xs text-[#444653]">
                    Esquema versionado {telemetry.schema_actual} (compatible con {telemetry.versiones_compatibles.join(', ')}) · Actores seudonimizados (HMAC-SHA256) · Tiempos en UTC.
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    telemetry.estado_pipeline === 'Saludable'
                      ? 'text-[#047857]'
                      : telemetry.estado_pipeline === 'Con reintentos'
                        ? 'text-[#b45309]'
                        : 'text-[#ba1a1a]'
                  }`}
                >
                  Estado del pipeline: {telemetry.estado_pipeline} · Pérdida {telemetry.contadores_control.tasa_perdida_pct}%
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-[#444653]">Eventos en almacén UTC</p>
                  <p className="font-display text-xl font-bold text-[#1e40af] tabular-nums">
                    {telemetry.almacenamiento_analitico.total_eventos_bd}
                  </p>
                  <p className="text-[#444653] tabular-nums">
                    Últimas 24h: {telemetry.almacenamiento_analitico.eventos_ultimas_24h} · Actores únicos:{' '}
                    {telemetry.almacenamiento_analitico.actores_unicos_seudonimizados}
                  </p>
                </div>
                <div>
                  <p className="text-[#444653]">Latencia API (Prom / P95)</p>
                  <p className="font-display text-xl font-bold text-[#191c1e] tabular-nums">
                    {telemetry.almacenamiento_analitico.latencia_promedio_ms} /{' '}
                    {telemetry.almacenamiento_analitico.latencia_p95_ms} ms
                  </p>
                  <p className="text-[#444653] tabular-nums">
                    Tasa errores HTTP: {telemetry.almacenamiento_analitico.tasa_error_http_pct}%
                  </p>
                </div>
                <div>
                  <p className="text-[#444653]">Control de ingesta (sesión)</p>
                  <p className="font-display text-xl font-bold text-[#047857] tabular-nums">
                    {telemetry.contadores_control.persistidos_sesion} guardados
                  </p>
                  <p className="text-[#444653] tabular-nums">
                    Deduplicados: {telemetry.contadores_control.deduplicados_idempotencia} · Rechazados:{' '}
                    {telemetry.contadores_control.rechazados_validacion}
                  </p>
                </div>
                <div>
                  <p className="text-[#444653]">Reintentos y fallos BD</p>
                  <p className="font-display text-xl font-bold text-[#191c1e] tabular-nums">
                    {telemetry.contadores_control.reintentados} reintentos
                  </p>
                  <p className="text-[#444653] tabular-nums">
                    Descartados: {telemetry.contadores_control.descartados_perdidos} · Fallos reg.:{' '}
                    {telemetry.almacenamiento_analitico.fallos_registrados_bd}
                  </p>
                </div>
              </div>

              {telemetry.por_tipo_evento.length > 0 && (
                <div className="overflow-x-auto border-t border-slate-100 pt-4">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f7f9fb] text-[#444653] border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Tipo de evento automático</th>
                        <th className="px-4 py-2 font-semibold text-right">Total</th>
                        <th className="px-4 py-2 font-semibold text-right">Errores</th>
                        <th className="px-4 py-2 font-semibold text-right">Latencia promedio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {telemetry.por_tipo_evento.slice(0, 6).map((row) => (
                        <tr key={row.event_type}>
                          <td className="px-4 py-2 font-mono text-[#191c1e]">{row.event_type}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums">{row.total}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums">{row.errores}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums">
                            {row.latencia_promedio_ms !== null ? `${row.latencia_promedio_ms} ms` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Guía de interpretación y supuestos */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#1e40af]" />
              <h3 className="font-display text-base font-semibold text-[#191c1e]">
                Guía de Lectura, Supuestos y Errores de Interpretación a Evitar
              </h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
              <div className="space-y-2">
                <p className="font-semibold text-[#1e40af]">Supuestos aplicados en esta plataforma</p>
                <ul className="list-disc pl-4 space-y-1.5 text-[#444653]">
                  {report.criterios_y_errores_comunes.supuestos_plataforma.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-[#ba1a1a]">Errores frecuentes y cómo evitarlos</p>
                <ul className="space-y-2 text-[#444653]">
                  {report.criterios_y_errores_comunes.errores_interpretacion.map((item, idx) => (
                    <li key={idx}>
                      <strong className="text-[#191c1e]">{item.error}:</strong> {item.como_evitarlo}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
};
