import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  HelpCircle,
  Lock,
  Minus,
  Printer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AuthUser, Grado } from '../types';

interface PuntajeRow {
  id_puntaje: number;
  calificacion: number;
  fecha_realizacion: string;
  evaluacion_titulo: string;
  saber_titulo: string;
  codigo_estudiantil: string | null;
  nombre: string;
  apellido: string;
  nombre_grado: string;
}

interface StudentAcademicSummary {
  id_estudiante: number;
  id_usuario: number;
  codigo_estudiantil: string | null;
  id_grado: number;
  nombre: string;
  apellido: string;
  email: string;
  nombre_grado: string;
  seccion: string | null;
  evaluaciones_realizadas: number;
  evaluaciones_unicas: number;
  cobertura_pct: number;
  videos_completados: number;
  tiempo_activo_min: number;
  promedio_calificacion: number | null;
  ultima_calificacion: number | null;
  tendencia: 'alza' | 'estable' | 'descenso' | 'sin_tendencia';
  delta_tendencia: number;
  nivel_desempeno: 'Consolidado' | 'En proceso' | 'Requiere apoyo' | 'Sin evaluaciones';
  caida_sostenida: boolean;
}

interface GroupComparisonRow {
  id_grado: number;
  nombre_grado: string;
  seccion: string | null;
  total_estudiantes: number;
  estudiantes_evaluados: number;
  intentos_totales: number;
  promedio_grupo: number | null;
  tasa_aprobacion_pct: number;
  estudiantes_en_riesgo: number;
}

interface CompetencyMasteryRow {
  id_saber: number;
  saber_titulo: string;
  id_grado: number;
  nombre_grado: string;
  intentos: number;
  estudiantes_evaluados: number;
  promedio_saber: number | null;
  tasa_aprobacion_pct: number;
  estado_competencia: 'Consolidado' | 'En desarrollo' | 'Requiere refuerzo' | 'Sin datos';
}

interface PedagogicalAlert {
  id: string;
  tipo: 'caida_sostenida' | 'bajo_desempeno' | 'sin_actividad' | 'dificultad_grupal';
  severidad: 'alta' | 'media';
  titulo: string;
  detalle: string;
  id_estudiante?: number;
  id_saber?: number;
}

interface SaberInterestRow {
  id_saber: number;
  saber_titulo: string;
  descripcion: string | null;
  id_grado: number;
  nombre_grado: string;
  evaluaciones_presentadas: number;
  videos_completados: number;
  duelos_elegidos: number;
  salas_virtuales: number;
  estudiantes_unicos: number;
  total_selecciones: number;
  porcentaje_preferencia: number;
}

interface TeacherAcademicReport {
  filtro_grado_id: number | null;
  criterios: {
    escala: string;
    umbral_aprobacion: number;
    umbral_consolidado: number;
    umbral_refuerzo_grupal: number;
    criterio_tendencia: string;
    criterio_caida_sostenida: string;
    datos_disponibles: string[];
    datos_no_registrados: string[];
  };
  resumen_general: {
    total_estudiantes: number;
    estudiantes_con_evaluaciones: number;
    estudiantes_en_riesgo: number;
    promedio_grupo: number | null;
    tasa_aprobacion_pct: number;
    cobertura_promedio_pct: number;
    total_evaluaciones_catalogo: number;
  };
  comparativa_grados: GroupComparisonRow[];
  estudiantes: StudentAcademicSummary[];
  competencias_saberes: CompetencyMasteryRow[];
  saberes_intereses: {
    total_interacciones: number;
    nivel_confianza: 'alto' | 'medio' | 'bajo';
    nota_metodologica: string;
    datos_faltantes: string[];
    ranking: SaberInterestRow[];
  };
  alertas: PedagogicalAlert[];
}

interface PrivateStudentReport {
  generado_en: string;
  aviso_privacidad: string;
  estudiante: {
    id_estudiante: number;
    nombre_completo: string;
    codigo_estudiantil: string | null;
    grado: string;
  };
  resumen: {
    promedio_calificacion: number | null;
    promedio_porcentaje: number;
    evaluaciones_realizadas: number;
    evaluaciones_unicas: number;
    total_evaluaciones_catalogo: number;
    cobertura_pct: number;
    videos_completados: number;
    total_videos_catalogo: number;
    sesiones_activas: number;
    tiempo_activo_total_ms: number;
    tendencia: 'alza' | 'estable' | 'descenso' | 'sin_tendencia';
    delta_tendencia: number;
    nivel_desempeno: 'Consolidado' | 'En proceso' | 'Requiere apoyo' | 'Sin evaluaciones';
    caida_sostenida: boolean;
  };
  evolucion_temporal: Array<{
    id_puntaje: number;
    fecha_realizacion: string;
    evaluacion_titulo: string;
    saber_titulo: string;
    calificacion: number;
    porcentaje: number;
    aprobada: boolean;
  }>;
  desempeno_saberes: Array<{
    id_saber: number;
    saber_titulo: string;
    intentos: number;
    promedio: number;
    estado: 'Consolidado' | 'En desarrollo' | 'Requiere refuerzo';
  }>;
  recomendaciones: string[];
}

type TeacherTab = 'resumen' | 'comparativa' | 'competencias' | 'intereses' | 'individual';

interface ProfesorViewProps {
  user: AuthUser;
}

function formatMinutesLabel(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} h ${m} min`;
}

function escapeCsvCell(val: string | number | null): string {
  const s = val === null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const ProfesorView: React.FC<ProfesorViewProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<TeacherTab>('resumen');
  const [grados, setGrados] = useState<Grado[]>([]);
  const [selectedGrado, setSelectedGrado] = useState<string>(
    user.id_grado ? String(user.id_grado) : 'todos'
  );
  const [puntajes, setPuntajes] = useState<PuntajeRow[]>([]);
  const [report, setReport] = useState<TeacherAcademicReport | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [privateReport, setPrivateReport] = useState<PrivateStudentReport | null>(null);
  const [loadingPrivate, setLoadingPrivate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    const panelQs =
      selectedGrado && selectedGrado !== 'todos'
        ? `?id_grado=${encodeURIComponent(selectedGrado)}`
        : '';
    const reportQs = `?id_grado=${encodeURIComponent(selectedGrado || 'todos')}`;

    try {
      const [panelRes, repRes] = await Promise.all([
        apiFetch(`/api/profesor/panel${panelQs}`),
        apiFetch(`/api/profesor/reportes${reportQs}`),
      ]);
      const panelData = await panelRes.json();
      const repData = await repRes.json();
      if (!panelRes.ok) throw new Error(panelData.error || 'Acceso denegado');
      if (!repRes.ok) throw new Error(repData.error || 'No se pudieron generar los reportes');

      setGrados(panelData.grados || []);
      setPuntajes(panelData.puntajes || []);
      setReport(repData as TeacherAcademicReport);

      const studentsList: StudentAcademicSummary[] = repData.estudiantes || [];
      setSelectedStudentId((prev) => {
        if (prev && studentsList.some((s) => s.id_estudiante === prev)) return prev;
        return studentsList[0]?.id_estudiante ?? null;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedGrado]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!selectedStudentId) {
      setPrivateReport(null);
      return;
    }
    let cancelled = false;
    setLoadingPrivate(true);
    apiFetch(`/api/profesor/reportes/estudiante/${selectedStudentId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No se pudo cargar la ficha individual');
        if (!cancelled) setPrivateReport(d as PrivateStudentReport);
      })
      .catch(() => {
        if (!cancelled) setPrivateReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPrivate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId]);

  const filteredStudents = useMemo(() => {
    if (!report) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return report.estudiantes;
    return report.estudiantes.filter(
      (st) =>
        `${st.nombre} ${st.apellido}`.toLowerCase().includes(q) ||
        (st.codigo_estudiantil || '').toLowerCase().includes(q)
    );
  }, [report, searchQuery]);

  function openStudentProfile(idEstudiante: number) {
    setSelectedStudentId(idEstudiante);
    setActiveTab('individual');
  }

  function downloadGroupCsv() {
    if (!report) return;
    const headers = [
      'Código',
      'Estudiante',
      'Grado',
      'Evaluaciones',
      'Cobertura (%)',
      'Videos completados',
      'Tiempo activo (min)',
      'Promedio (/5.00)',
      'Última nota',
      'Tendencia',
      'Delta',
      'Nivel de desempeño',
      'Alerta caída sostenida',
    ];
    const rows = report.estudiantes.map((e) => [
      e.codigo_estudiantil || '',
      `${e.nombre} ${e.apellido}`,
      `${e.nombre_grado}${e.seccion ? ` (${e.seccion})` : ''}`,
      e.evaluaciones_realizadas,
      e.cobertura_pct,
      e.videos_completados,
      e.tiempo_activo_min,
      e.promedio_calificacion !== null ? e.promedio_calificacion.toFixed(2) : 'Sin notas',
      e.ultima_calificacion !== null ? e.ultima_calificacion.toFixed(2) : '—',
      e.tendencia,
      e.delta_tendencia.toFixed(2),
      e.nivel_desempeno,
      e.caida_sostenida ? 'Sí' : 'No',
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aba-reporte-academico-grupo.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadPrivateStudentCsv() {
    if (!privateReport) return;
    const { estudiante, resumen, evolucion_temporal, desempeno_saberes, recomendaciones, aviso_privacidad } =
      privateReport;
    const lines: Array<Array<string | number>> = [
      ['REPORTE ACADÉMICO INDIVIDUAL PRIVADO - A.B.A.'],
      [aviso_privacidad],
      ['Estudiante', estudiante.nombre_completo, 'Código', estudiante.codigo_estudiantil || '—', 'Grado', estudiante.grado],
      [
        'Promedio (/5.00)',
        resumen.promedio_calificacion !== null ? resumen.promedio_calificacion.toFixed(2) : 'Sin notas',
        'Nivel',
        resumen.nivel_desempeno,
        'Cobertura (%)',
        resumen.cobertura_pct,
      ],
      [],
      ['EVOLUCIÓN TEMPORAL DE EVALUACIONES'],
      ['Fecha', 'Evaluación', 'Saber', 'Nota (/5.00)', 'Porcentaje (%)', 'Resultado'],
      ...evolucion_temporal.map((ev) => [
        ev.fecha_realizacion,
        ev.evaluacion_titulo,
        ev.saber_titulo,
        ev.calificacion.toFixed(2),
        ev.porcentaje,
        ev.aprobada ? 'Aprobada' : 'Por reforzar',
      ]),
      [],
      ['DESEMPEÑO POR SABER'],
      ['Saber', 'Intentos', 'Promedio (/5.00)', 'Estado'],
      ...desempeno_saberes.map((sb) => [sb.saber_titulo, sb.intentos, sb.promedio.toFixed(2), sb.estado]),
      [],
      ['RECOMENDACIONES PEDAGÓGICAS'],
      ...recomendaciones.map((rec, i) => [`${i + 1}. ${rec}`]),
    ];

    const csv = '\uFEFF' + lines.map((r) => r.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = estudiante.nombre_completo.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    link.download = `reporte-individual-${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
        <p className="font-display text-3xl font-bold text-[#ba1a1a]">403</p>
        <p className="text-base font-semibold text-[#191c1e]">{error}</p>
      </div>
    );
  }

  const tabs: Array<{ id: TeacherTab; label: string }> = [
    { id: 'resumen', label: 'Resumen y Alertas' },
    { id: 'comparativa', label: 'Comparativa Grupos y Alumnos' },
    { id: 'competencias', label: 'Competencias (Saberes)' },
    { id: 'intereses', label: 'Saberes más Seleccionados' },
    { id: 'individual', label: 'Ficha Individual y Reporte Privado' },
  ];

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 print:hidden">
        <div>
          <p className="text-xs font-semibold text-[#4f46e5]">
            {user.especialidad ? `Especialidad: ${user.especialidad}` : 'Seguimiento Académico'}
            {user.nombre_grado ? ` · Grado asignado: ${user.nombre_grado}` : ''}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-[#191c1e]">
            Reportes de Rendimiento Académico
          </h1>
          <p className="mt-1 text-sm text-[#444653] max-w-2xl">
            Evalúa el progreso del grupo e individual, detecta alertas tempranas, identifica saberes a reforzar y exporta fichas privadas para cada estudiante o familia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="prof-grado-select" className="text-xs font-semibold text-[#444653] whitespace-nowrap">
              Filtrar grupo:
            </label>
            <select
              id="prof-grado-select"
              value={selectedGrado}
              onChange={(e) => setSelectedGrado(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
            >
              <option value="todos">Todos los grados</option>
              {grados.map((g) => (
                <option key={g.id_grado} value={g.id_grado}>
                  {g.nombre_grado} ({g.seccion})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={downloadGroupCsv}
            disabled={!report}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#191c1e] transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV Grupo</span>
          </button>
        </div>
      </div>

      {/* Pestañas de navegación */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 print:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === tab.id
                ? 'bg-[#4f46e5] text-white'
                : 'bg-white border border-slate-200 text-[#444653] hover:text-[#191c1e] hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && !report ? (
        <div className="py-12 text-center text-sm text-[#444653]">
          Generando reportes académicos...
        </div>
      ) : report ? (
        <>
          {/* TAB 1: RESUMEN Y ALERTAS */}
          {activeTab === 'resumen' && (
            <div className="space-y-8">
              {/* KPIs principales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#444653]">
                    <span>Promedio del Grupo</span>
                    <TrendingUp className="w-4 h-4 text-[#4f46e5]" />
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold text-[#1e40af] tabular-nums">
                    {report.resumen_general.promedio_grupo !== null
                      ? `${report.resumen_general.promedio_grupo.toFixed(2)} / 5.00`
                      : 'Sin notas'}
                  </p>
                  <p className="mt-1 text-xs text-[#444653] tabular-nums">
                    Umbral aprobatorio: {report.criterios.umbral_aprobacion.toFixed(2)}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#444653]">
                    <span>Tasa de Aprobación</span>
                    <CheckCircle2 className="w-4 h-4 text-[#047857]" />
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold text-[#047857] tabular-nums">
                    {report.resumen_general.tasa_aprobacion_pct}%
                  </p>
                  <p className="mt-1 text-xs text-[#444653] tabular-nums">
                    Evaluaciones con nota ≥ {report.criterios.umbral_aprobacion.toFixed(2)}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#444653]">
                    <span>Cobertura de Evaluaciones</span>
                    <BookOpen className="w-4 h-4 text-[#1e40af]" />
                  </div>
                  <p className="mt-2 font-display text-2xl font-bold text-[#191c1e] tabular-nums">
                    {report.resumen_general.cobertura_promedio_pct}%
                  </p>
                  <p className="mt-1 text-xs text-[#444653] tabular-nums">
                    {report.resumen_general.estudiantes_con_evaluaciones} de{' '}
                    {report.resumen_general.total_estudiantes} alumnos evaluados
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#444653]">
                    <span>Estudiantes en Riesgo</span>
                    <AlertTriangle className="w-4 h-4 text-[#ba1a1a]" />
                  </div>
                  <p
                    className={`mt-2 font-display text-2xl font-bold tabular-nums ${
                      report.resumen_general.estudiantes_en_riesgo > 0
                        ? 'text-[#ba1a1a]'
                        : 'text-[#047857]'
                    }`}
                  >
                    {report.resumen_general.estudiantes_en_riesgo}
                  </p>
                  <p className="mt-1 text-xs text-[#444653]">
                    Caída sostenida o promedio &lt; {report.criterios.umbral_aprobacion.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Alertas tempranas */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                      Alertas Pedagógicas Priorizadas
                    </h2>
                    <p className="text-xs text-[#444653]">
                      Identifica de un vistazo caídas de rendimiento, alumnos sin evaluaciones o saberes con dificultad común.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#444653] tabular-nums">
                    {report.alertas.length} alerta(s)
                  </span>
                </div>

                {report.alertas.length === 0 ? (
                  <div className="p-6 flex items-center gap-3 text-sm text-[#047857]">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>No hay alertas de riesgo ni dificultades grupales pendientes en este filtro.</span>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {report.alertas.map((al) => (
                      <div
                        key={al.id}
                        className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60"
                      >
                        <div className="flex items-start gap-3">
                          <AlertTriangle
                            className={`w-4 h-4 mt-0.5 shrink-0 ${
                              al.severidad === 'alta' ? 'text-[#ba1a1a]' : 'text-amber-600'
                            }`}
                          />
                          <div>
                            <p className="text-sm font-semibold text-[#191c1e]">{al.titulo}</p>
                            <p className="text-xs text-[#444653] mt-0.5">{al.detalle}</p>
                          </div>
                        </div>
                        {al.id_estudiante ? (
                          <button
                            type="button"
                            onClick={() => openStudentProfile(al.id_estudiante!)}
                            className="shrink-0 text-xs font-semibold text-[#4f46e5] hover:underline text-left sm:text-right"
                          >
                            Abrir ficha individual
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveTab('competencias')}
                            className="shrink-0 text-xs font-semibold text-[#4f46e5] hover:underline text-left sm:text-right"
                          >
                            Revisar competencia
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Criterios de lectura e inventario de datos */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-3">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-[#4f46e5]" />
                    <h2 className="font-display text-base font-semibold text-[#191c1e]">
                      Criterios de Lectura de los Indicadores
                    </h2>
                  </div>
                  <ul className="space-y-2 text-xs text-[#444653] leading-relaxed">
                    <li>
                      <strong className="text-[#191c1e]">Escala y niveles:</strong>{' '}
                      {report.criterios.escala} <strong>Consolidado</strong> (≥{' '}
                      {report.criterios.umbral_consolidado.toFixed(2)}), <strong>En proceso</strong> (
                      {report.criterios.umbral_aprobacion.toFixed(2)} – 3.99),{' '}
                      <strong>Requiere apoyo</strong> (&lt;{' '}
                      {report.criterios.umbral_aprobacion.toFixed(2)}).
                    </li>
                    <li>
                      <strong className="text-[#191c1e]">Tendencia:</strong>{' '}
                      {report.criterios.criterio_tendencia}
                    </li>
                    <li>
                      <strong className="text-[#191c1e]">Alerta de caída sostenida:</strong>{' '}
                      {report.criterios.criterio_caida_sostenida}
                    </li>
                  </ul>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#1e40af]" />
                    <h2 className="font-display text-base font-semibold text-[#191c1e]">
                      Datos Disponibles y Alcance en A.B.A.
                    </h2>
                  </div>
                  <div className="space-y-2 text-xs text-[#444653] leading-relaxed">
                    <p className="font-semibold text-[#047857]">Datos incluidos en este reporte:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {report.criterios.datos_disponibles.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                    <p className="font-semibold text-amber-700 pt-1">
                      Datos no presentes en el sistema (requieren registro externo si se desean):
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      {report.criterios.datos_no_registrados.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: COMPARATIVA GRUPOS Y ALUMNOS */}
          {activeTab === 'comparativa' && (
            <div className="space-y-8">
              {/* Comparativa entre grados / cursos */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#4f46e5]" />
                    <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                      Comparativa Entre Cursos / Grados
                    </h2>
                  </div>
                  <span className="text-xs text-[#444653]">Promedio sobre escala 5.00</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Curso / Grado</th>
                        <th className="px-6 py-3 font-semibold">Evaluados / Total</th>
                        <th className="px-6 py-3 font-semibold">Intentos</th>
                        <th className="px-6 py-3 font-semibold">Promedio</th>
                        <th className="px-6 py-3 font-semibold">Aprobación</th>
                        <th className="px-6 py-3 font-semibold">En riesgo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.comparativa_grados.map((gr) => {
                        const pct = gr.promedio_grupo ? Math.round((gr.promedio_grupo / 5) * 100) : 0;
                        return (
                          <tr key={gr.id_grado} className="hover:bg-slate-50/70">
                            <td className="px-6 py-3.5 font-medium text-[#191c1e]">
                              {gr.nombre_grado} {gr.seccion ? `(${gr.seccion})` : ''}
                            </td>
                            <td className="px-6 py-3.5 font-mono-num">
                              {gr.estudiantes_evaluados} / {gr.total_estudiantes}
                            </td>
                            <td className="px-6 py-3.5 font-mono-num">{gr.intentos_totales}</td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#4f46e5]"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="font-mono-num font-semibold text-[#1e40af]">
                                  {gr.promedio_grupo !== null ? gr.promedio_grupo.toFixed(2) : '—'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-3.5 font-mono-num">{gr.tasa_aprobacion_pct}%</td>
                            <td className="px-6 py-3.5 font-mono-num font-semibold">
                              <span
                                className={
                                  gr.estudiantes_en_riesgo > 0 ? 'text-[#ba1a1a]' : 'text-[#047857]'
                                }
                              >
                                {gr.estudiantes_en_riesgo}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Comparativa de estudiantes con progreso individual */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                      Comparativa de Estudiantes y Tendencia Individual
                    </h2>
                    <p className="text-xs text-[#444653]">
                      Cruza calificaciones, cobertura, videos vistos, tiempo activo en plataforma y tendencia reciente.
                    </p>
                  </div>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre o código..."
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-[#191c1e] focus:border-[#4f46e5] focus:outline-none w-full sm:w-64"
                  />
                </div>

                {filteredStudents.length === 0 ? (
                  <p className="p-6 text-sm text-[#444653]">
                    No se encontraron estudiantes para los criterios seleccionados.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-3 font-semibold">Estudiante</th>
                          <th className="px-5 py-3 font-semibold">Grado</th>
                          <th className="px-5 py-3 font-semibold">Cobertura · Videos</th>
                          <th className="px-5 py-3 font-semibold">Tiempo Activo</th>
                          <th className="px-5 py-3 font-semibold">Promedio</th>
                          <th className="px-5 py-3 font-semibold">Tendencia</th>
                          <th className="px-5 py-3 font-semibold">Estado</th>
                          <th className="px-5 py-3 font-semibold text-right">Ficha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStudents.map((est) => (
                          <tr key={est.id_estudiante} className="hover:bg-slate-50/70">
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-[#191c1e]">
                                {est.nombre} {est.apellido}
                              </div>
                              <div className="text-xs font-mono-num text-[#444653]">
                                {est.codigo_estudiantil || '—'}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-xs text-[#444653]">
                              {est.nombre_grado} {est.seccion ? `(${est.seccion})` : ''}
                            </td>
                            <td className="px-5 py-3.5 font-mono-num text-xs text-[#444653]">
                              {est.cobertura_pct}% ({est.evaluaciones_realizadas} eval.) ·{' '}
                              {est.videos_completados} vid.
                            </td>
                            <td className="px-5 py-3.5 font-mono-num text-xs text-[#444653]">
                              {est.tiempo_activo_min} min
                            </td>
                            <td className="px-5 py-3.5 font-mono-num font-semibold text-[#1e40af]">
                              {est.promedio_calificacion !== null
                                ? `${est.promedio_calificacion.toFixed(2)} / 5.00`
                                : 'Sin notas'}
                            </td>
                            <td className="px-5 py-3.5 text-xs font-semibold tabular-nums">
                              {est.tendencia === 'alza' ? (
                                <span className="inline-flex items-center gap-1 text-[#047857]">
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                  +{est.delta_tendencia.toFixed(2)}
                                </span>
                              ) : est.tendencia === 'descenso' ? (
                                <span className="inline-flex items-center gap-1 text-[#ba1a1a]">
                                  <ArrowDownRight className="w-3.5 h-3.5" />
                                  {est.delta_tendencia.toFixed(2)}
                                </span>
                              ) : est.tendencia === 'estable' ? (
                                <span className="inline-flex items-center gap-1 text-[#444653]">
                                  <Minus className="w-3.5 h-3.5" />
                                  Estable
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-xs font-semibold">
                              <span
                                className={
                                  est.nivel_desempeno === 'Consolidado'
                                    ? 'text-[#047857]'
                                    : est.nivel_desempeno === 'Requiere apoyo'
                                      ? 'text-[#ba1a1a]'
                                      : est.nivel_desempeno === 'En proceso'
                                        ? 'text-[#1e40af]'
                                        : 'text-[#444653]'
                                }
                              >
                                {est.nivel_desempeno}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => openStudentProfile(est.id_estudiante)}
                                className="text-xs font-semibold text-[#4f46e5] hover:underline"
                              >
                                Ver ficha
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Registro cronológico detallado */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                    Historial Detallado de Calificaciones
                  </h2>
                  <span className="text-xs text-[#444653] tabular-nums">
                    {puntajes.length} calificación(es)
                  </span>
                </div>
                {puntajes.length === 0 ? (
                  <p className="p-6 text-sm text-[#444653]">
                    Aún no hay evaluaciones presentadas en este grupo.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 font-semibold">Estudiante</th>
                          <th className="px-6 py-3 font-semibold">Evaluación</th>
                          <th className="px-6 py-3 font-semibold">Saber</th>
                          <th className="px-6 py-3 font-semibold">Nota</th>
                          <th className="px-6 py-3 font-semibold">Fecha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {puntajes.map((pt) => (
                          <tr key={pt.id_puntaje} className="hover:bg-slate-50/70">
                            <td className="px-6 py-3.5 font-medium text-[#191c1e]">
                              {pt.nombre} {pt.apellido}
                            </td>
                            <td className="px-6 py-3.5 text-[#191c1e]">{pt.evaluacion_titulo}</td>
                            <td className="px-6 py-3.5 text-[#444653]">{pt.saber_titulo}</td>
                            <td
                              className={`px-6 py-3.5 font-mono-num font-semibold ${
                                Number(pt.calificacion) >= 3 ? 'text-[#047857]' : 'text-[#ba1a1a]'
                              }`}
                            >
                              {Number(pt.calificacion).toFixed(2)} / 5.00
                            </td>
                            <td className="px-6 py-3.5 font-mono-num text-xs text-[#444653]">
                              {pt.fecha_realizacion}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 3: COMPETENCIAS (SABERES) */}
          {activeTab === 'competencias' && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                    Dominio por Competencia / Saber
                  </h2>
                  <p className="text-xs text-[#444653]">
                    Consolidado: promedio ≥ 4.00 y ≥ 75% aprobación · En desarrollo: ≥ 3.50 · Requiere refuerzo: &lt; 3.50 o &lt; 60% aprobación.
                  </p>
                </div>
                <span className="text-xs text-[#444653] tabular-nums">
                  {report.competencias_saberes.length} saber(es)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Saber / Competencia</th>
                      <th className="px-6 py-3 font-semibold">Grado</th>
                      <th className="px-6 py-3 font-semibold">Evaluados (Intentos)</th>
                      <th className="px-6 py-3 font-semibold">Promedio</th>
                      <th className="px-6 py-3 font-semibold">Aprobación</th>
                      <th className="px-6 py-3 font-semibold">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.competencias_saberes.map((sb) => {
                      const pct = sb.promedio_saber ? Math.round((sb.promedio_saber / 5) * 100) : 0;
                      return (
                        <tr key={sb.id_saber} className="hover:bg-slate-50/70">
                          <td className="px-6 py-3.5 font-medium text-[#191c1e]">
                            {sb.saber_titulo}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-[#444653]">{sb.nombre_grado}</td>
                          <td className="px-6 py-3.5 font-mono-num text-xs text-[#444653]">
                            {sb.estudiantes_evaluados} alum. ({sb.intentos} int.)
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    sb.estado_competencia === 'Consolidado'
                                      ? 'bg-[#047857]'
                                      : sb.estado_competencia === 'Requiere refuerzo'
                                        ? 'bg-[#ba1a1a]'
                                        : 'bg-[#4f46e5]'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="font-mono-num font-semibold text-[#191c1e]">
                                {sb.promedio_saber !== null ? sb.promedio_saber.toFixed(2) : '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 font-mono-num">{sb.tasa_aprobacion_pct}%</td>
                          <td className="px-6 py-3.5 text-xs font-semibold">
                            <span
                              className={
                                sb.estado_competencia === 'Consolidado'
                                  ? 'text-[#047857]'
                                  : sb.estado_competencia === 'Requiere refuerzo'
                                    ? 'text-[#ba1a1a]'
                                    : sb.estado_competencia === 'En desarrollo'
                                      ? 'text-[#1e40af]'
                                      : 'text-[#444653]'
                              }
                            >
                              {sb.estado_competencia}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB 3B: SABERES MÁS SELECCIONADOS / INTERESES ACADÉMICOS */}
          {activeTab === 'intereses' && (
            <div className="space-y-6">
              <section className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-[#191c1e]">
                      Ranking de Saberes más Seleccionados (Mayor a Menor Preferencia)
                    </h2>
                    <p className="text-xs text-[#444653] mt-0.5">
                      {report.saberes_intereses.nota_metodologica}
                    </p>
                  </div>
                  <div className="text-left sm:text-right text-xs">
                    <span className="text-[#444653] block">Nivel de confianza de la muestra</span>
                    <strong
                      className={`uppercase font-semibold ${
                        report.saberes_intereses.nivel_confianza === 'alto'
                          ? 'text-[#047857]'
                          : report.saberes_intereses.nivel_confianza === 'medio'
                            ? 'text-[#1e40af]'
                            : 'text-amber-700'
                      }`}
                    >
                      {report.saberes_intereses.nivel_confianza} (
                      {report.saberes_intereses.total_interacciones} interacciones)
                    </strong>
                  </div>
                </div>

                {report.saberes_intereses.ranking.length === 0 ? (
                  <p className="text-sm text-[#444653]">
                    No hay saberes registrados para este filtro.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 font-semibold">#</th>
                          <th className="px-4 py-3 font-semibold">Saber</th>
                          <th className="px-4 py-3 font-semibold">Grado</th>
                          <th className="px-4 py-3 font-semibold">Eval.</th>
                          <th className="px-4 py-3 font-semibold">Videos</th>
                          <th className="px-4 py-3 font-semibold">Duelos</th>
                          <th className="px-4 py-3 font-semibold">Salas</th>
                          <th className="px-4 py-3 font-semibold">Estudiantes</th>
                          <th className="px-4 py-3 font-semibold">Participación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.saberes_intereses.ranking.map((item, idx) => (
                          <tr key={item.id_saber} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3 font-mono-num text-xs font-semibold text-[#444653]">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-[#191c1e]">{item.saber_titulo}</p>
                              {item.descripcion && (
                                <p className="text-xs text-[#444653]">{item.descripcion}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-[#444653]">
                              {item.nombre_grado}
                            </td>
                            <td className="px-4 py-3 font-mono-num text-xs">
                              {item.evaluaciones_presentadas}
                            </td>
                            <td className="px-4 py-3 font-mono-num text-xs">
                              {item.videos_completados}
                            </td>
                            <td className="px-4 py-3 font-mono-num text-xs">
                              {item.duelos_elegidos}
                            </td>
                            <td className="px-4 py-3 font-mono-num text-xs">
                              {item.salas_virtuales}
                            </td>
                            <td className="px-4 py-3 font-mono-num text-xs font-semibold text-[#191c1e]">
                              {item.estudiantes_unicos}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#4f46e5]"
                                    style={{ width: `${Math.min(100, item.porcentaje_preferencia)}%` }}
                                  />
                                </div>
                                <span className="font-mono-num text-xs font-semibold text-[#1e40af]">
                                  {item.total_selecciones} ({item.porcentaje_preferencia}%)
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="bg-[#f7f9fb] border border-slate-200 rounded-xl p-4 text-xs text-[#444653] space-y-1">
                  <p className="font-semibold text-[#191c1e]">
                    Limitaciones de los datos registrados en la plataforma:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {report.saberes_intereses.datos_faltantes.map((lim) => (
                      <li key={lim}>{lim}</li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: FICHA INDIVIDUAL Y REPORTE PRIVADO COMPARTIBLE */}
          {activeTab === 'individual' && (
            <div className="space-y-6">
              {/* Selector de estudiante y acciones de exportación */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="prof-student-select" className="text-xs font-semibold text-[#444653]">
                    Seleccionar estudiante:
                  </label>
                  <select
                    id="prof-student-select"
                    value={selectedStudentId ?? ''}
                    onChange={(e) => setSelectedStudentId(e.target.value ? Number(e.target.value) : null)}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none min-w-[260px]"
                  >
                    {report.estudiantes.map((st) => (
                      <option key={st.id_estudiante} value={st.id_estudiante}>
                        {st.nombre} {st.apellido} ({st.codigo_estudiantil || st.nombre_grado})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={downloadPrivateStudentCsv}
                    disabled={!privateReport}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-[#191c1e] transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar ficha CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    disabled={!privateReport}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-50 text-white text-xs font-semibold transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir / PDF privado</span>
                  </button>
                </div>
              </section>

              {loadingPrivate ? (
                <div className="py-12 text-center text-sm text-[#444653]">
                  Cargando ficha individual...
                </div>
              ) : !privateReport ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-[#444653]">
                  Selecciona un estudiante para visualizar su reporte individual privado.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Garantía de privacidad para compartir */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation flex items-start gap-3">
                    <Lock className="w-4 h-4 text-[#047857] mt-0.5 shrink-0" />
                    <div className="text-xs text-[#444653]">
                      <p className="font-semibold text-[#191c1e]">
                        Reporte Individual Privado — Apto para compartir con el estudiante o su familia
                      </p>
                      <p className="mt-0.5">{privateReport.aviso_privacidad}</p>
                    </div>
                  </div>

                  {/* Ficha principal del estudiante */}
                  <section className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                      <div>
                        <p className="text-xs font-mono-num text-[#4f46e5] font-semibold">
                          {privateReport.estudiante.codigo_estudiantil || 'Estudiante'} ·{' '}
                          {privateReport.estudiante.grado}
                        </p>
                        <h2 className="mt-1 font-display text-2xl font-bold text-[#191c1e]">
                          {privateReport.estudiante.nombre_completo}
                        </h2>
                      </div>
                      <div className="text-left sm:text-right">
                        <span className="block text-xs text-[#444653]">Nivel de desempeño actual</span>
                        <strong
                          className={`font-display text-lg font-bold ${
                            privateReport.resumen.nivel_desempeno === 'Consolidado'
                              ? 'text-[#047857]'
                              : privateReport.resumen.nivel_desempeno === 'Requiere apoyo'
                                ? 'text-[#ba1a1a]'
                                : 'text-[#1e40af]'
                          }`}
                        >
                          {privateReport.resumen.nivel_desempeno}
                        </strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-[#f7f9fb] rounded-xl p-4">
                        <span className="text-xs text-[#444653]">Promedio Acumulado</span>
                        <p className="mt-1 font-display text-xl font-bold text-[#1e40af] tabular-nums">
                          {privateReport.resumen.promedio_calificacion !== null
                            ? `${privateReport.resumen.promedio_calificacion.toFixed(2)} / 5.00`
                            : 'Sin notas'}
                        </p>
                        <span className="text-xs text-[#444653] tabular-nums">
                          {privateReport.resumen.promedio_porcentaje}%
                        </span>
                      </div>

                      <div className="bg-[#f7f9fb] rounded-xl p-4">
                        <span className="text-xs text-[#444653]">Cobertura de Evaluaciones</span>
                        <p className="mt-1 font-display text-xl font-bold text-[#191c1e] tabular-nums">
                          {privateReport.resumen.evaluaciones_unicas} /{' '}
                          {privateReport.resumen.total_evaluaciones_catalogo}
                        </p>
                        <span className="text-xs text-[#444653] tabular-nums">
                          {privateReport.resumen.cobertura_pct}% completado
                        </span>
                      </div>

                      <div className="bg-[#f7f9fb] rounded-xl p-4">
                        <span className="text-xs text-[#444653]">Videos de Apoyo</span>
                        <p className="mt-1 font-display text-xl font-bold text-[#191c1e] tabular-nums">
                          {privateReport.resumen.videos_completados} /{' '}
                          {privateReport.resumen.total_videos_catalogo}
                        </p>
                        <span className="text-xs text-[#444653]">Completados</span>
                      </div>

                      <div className="bg-[#f7f9fb] rounded-xl p-4">
                        <span className="text-xs text-[#444653]">Dedicación en Plataforma</span>
                        <p className="mt-1 font-display text-xl font-bold text-[#191c1e] tabular-nums">
                          {formatMinutesLabel(privateReport.resumen.tiempo_activo_total_ms)}
                        </p>
                        <span className="text-xs text-[#444653] tabular-nums">
                          {privateReport.resumen.sesiones_activas} sesión(es)
                        </span>
                      </div>
                    </div>

                    {/* Gráfica SVG de evolución cronológica */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-base font-semibold text-[#191c1e]">
                          Evolución del Desempeño en el Tiempo
                        </h3>
                        <span className="text-xs text-[#444653]">
                          Línea punteada: nota mínima aprobatoria (3.00)
                        </span>
                      </div>
                      {privateReport.evolucion_temporal.length === 0 ? (
                        <p className="text-sm text-[#444653] py-4">
                          El estudiante aún no registra evaluaciones presentadas.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {privateReport.evolucion_temporal.map((ev) => {
                            const widthPct = Math.max(4, Math.round((ev.calificacion / 5) * 100));
                            return (
                              <div
                                key={ev.id_puntaje}
                                className="grid grid-cols-1 md:grid-cols-[110px_220px_1fr_90px] items-center gap-3 text-xs"
                              >
                                <span className="font-mono-num text-[#444653]">
                                  {ev.fecha_realizacion}
                                </span>
                                <span className="font-medium text-[#191c1e] truncate" title={ev.evaluacion_titulo}>
                                  {ev.evaluacion_titulo}
                                </span>
                                <div className="relative h-4 bg-[#f2f4f6] rounded-md overflow-hidden">
                                  <div
                                    className={`h-full rounded-md ${
                                      ev.aprobada ? 'bg-[#047857]' : 'bg-[#ba1a1a]'
                                    }`}
                                    style={{ width: `${widthPct}%` }}
                                  />
                                  <div
                                    className="absolute top-0 bottom-0 border-l border-dashed border-slate-500"
                                    style={{ left: '60%' }}
                                    title="Umbral 3.00 / 5.00"
                                  />
                                </div>
                                <span
                                  className={`font-mono-num font-semibold text-right ${
                                    ev.aprobada ? 'text-[#047857]' : 'text-[#ba1a1a]'
                                  }`}
                                >
                                  {ev.calificacion.toFixed(2)} / 5.00
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Competencias del estudiante y recomendaciones */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                      <div className="space-y-2.5">
                        <h3 className="font-display text-base font-semibold text-[#191c1e]">
                          Desempeño por Saber Evaluado
                        </h3>
                        {privateReport.desempeno_saberes.length === 0 ? (
                          <p className="text-xs text-[#444653]">Sin saberes evaluados todavía.</p>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                            {privateReport.desempeno_saberes.map((sb) => (
                              <div
                                key={sb.id_saber}
                                className="px-4 py-2.5 flex items-center justify-between text-xs"
                              >
                                <div>
                                  <p className="font-semibold text-[#191c1e]">{sb.saber_titulo}</p>
                                  <p className="text-[#444653]">{sb.intentos} intento(s)</p>
                                </div>
                                <div className="text-right">
                                  <span className="font-mono-num font-bold text-[#191c1e] block">
                                    {sb.promedio.toFixed(2)} / 5.00
                                  </span>
                                  <span
                                    className={
                                      sb.estado === 'Consolidado'
                                        ? 'text-[#047857] font-semibold'
                                        : sb.estado === 'Requiere refuerzo'
                                          ? 'text-[#ba1a1a] font-semibold'
                                          : 'text-[#1e40af] font-semibold'
                                    }
                                  >
                                    {sb.estado}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        <h3 className="font-display text-base font-semibold text-[#191c1e]">
                          Recomendaciones Pedagógicas
                        </h3>
                        <ul className="space-y-2 border border-slate-200 rounded-xl p-4 bg-[#f7f9fb] text-xs text-[#191c1e] leading-relaxed">
                          {privateReport.recomendaciones.map((rec, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="font-mono-num font-bold text-[#4f46e5]">
                                {idx + 1}.
                              </span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
