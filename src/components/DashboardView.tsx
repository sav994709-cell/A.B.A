import React, { useEffect, useState } from 'react';
import { CheckCircle2, Star } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AuthUser } from '../types';

interface DashboardData {
  rol: string;
  resumen: {
    promedio_sobre_5: number;
    promedio_sobre_100: number;
    progreso_porcentaje?: number;
    evaluaciones_completadas?: number;
    total_evaluaciones: number;
    total_saberes: number;
    total_videos: number;
    total_registros_puntaje?: number;
  };
  puntajes: Array<{
    id_puntaje: number;
    id_evaluacion: number;
    calificacion: number;
    fecha_realizacion: string;
    evaluacion_titulo: string;
    saber_titulo: string;
    nombre_grado: string;
    nombre?: string;
    apellido?: string;
  }>;
  grafica: Array<{
    id_evaluacion: number;
    titulo: string;
    saber_titulo: string;
    calificacion: number;
    porcentaje: number;
    completada: boolean;
  }>;
  ultima_encuesta?: {
    calificacion_estrellas: number;
    comentario: string | null;
    fecha_registro: string;
  } | null;
}

interface DashboardViewProps {
  user: AuthUser;
  onOpenEvaluacion: (evalId: number) => void;
  onSessionExpired?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ user, onOpenEvaluacion, onSessionExpired }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [comentario, setComentario] = useState('');
  const [surveySaved, setSurveySaved] = useState(false);

  const onSessionExpiredRef = React.useRef(onSessionExpired);
  onSessionExpiredRef.current = onSessionExpired;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch('/api/dashboard/progreso')
      .then(async (r) => {
        const d = await r.json();
        if (!active) return;
        if (r.status === 401) {
          onSessionExpiredRef.current?.();
          throw new Error(d.error || 'Tu sesión ha expirado. Inicia sesión nuevamente.');
        }
        if (!r.ok || !d?.resumen) {
          throw new Error(d?.error || 'No se pudo cargar el resumen de progreso.');
        }
        setData(d as DashboardData);
        if (d.ultima_encuesta) {
          setStars(d.ultima_encuesta.calificacion_estrellas);
          setComentario(d.ultima_encuesta.comentario || '');
        }
      })
      .catch((err: Error) => {
        if (!active) return;
        setError(err.message || 'Error al consultar tu progreso.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id_usuario]);

  async function submitEncuesta(e: React.FormEvent) {
    e.preventDefault();
    setSurveySaved(false);
    const res = await apiFetch('/api/encuestas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calificacion_estrellas: stars, comentario }),
    });
    if (res.ok) {
      setSurveySaved(true);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#444653]">Cargando reportes de progreso...</div>;
  }

  if (error || !data || !data.resumen) {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 card-elevation">
        <p className="font-display text-xl font-bold text-[#ba1a1a]">No se pudieron cargar los reportes</p>
        <p className="text-sm text-[#444653]">{error || 'Intenta recargar la vista en unos segundos.'}</p>
      </div>
    );
  }

  const { resumen, grafica = [], puntajes = [] } = data;
  const avance = resumen.progreso_porcentaje ?? 100;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold text-[#4f46e5]">
          {user.nombre} {user.apellido} · {user.nombre_rol}
          {user.codigo_estudiantil ? ` · Código ${user.codigo_estudiantil}` : ''}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-[#191c1e]">
          Dashboard de Progreso y Reportes
        </h1>
        <p className="mt-1 text-sm text-[#444653]">
          Seguimiento cuantitativo de calificaciones, avance por evaluación y retroalimentación de experiencia.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation">
          <p className="text-xs font-semibold text-[#444653]">Promedio Acumulado</p>
          <p className="mt-2 font-display text-4xl font-bold text-[#1e40af] tabular-nums">
            {Number(resumen.promedio_sobre_100 ?? 0).toFixed(2)}/100
          </p>
          <p className="mt-1 text-xs text-[#444653] tabular-nums">
            Equivalente escala 5.00: {Number(resumen.promedio_sobre_5 ?? 0).toFixed(2)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation">
          <p className="text-xs font-semibold text-[#444653]">
            {user.nombre_rol === 'Estudiante' ? 'Avance de Evaluaciones' : 'Registros de Puntaje'}
          </p>
          <p className="mt-2 font-display text-4xl font-bold text-[#10b981] tabular-nums">
            {user.nombre_rol === 'Estudiante'
              ? `${avance.toFixed(2)}%`
              : `${resumen.total_registros_puntaje ?? puntajes.length}`}
          </p>
          <div className="mt-3 h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#10b981] transition-all" style={{ width: `${Math.min(100, avance)}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation">
          <p className="text-xs font-semibold text-[#444653]">Cobertura Curricular</p>
          <p className="mt-2 font-display text-4xl font-bold text-[#4f46e5] tabular-nums">
            {user.nombre_rol === 'Estudiante'
              ? `${resumen.evaluaciones_completadas ?? 0} / ${resumen.total_evaluaciones}`
              : `${resumen.total_saberes} saberes`}
          </p>
          <p className="mt-1 text-xs text-[#444653] tabular-nums">
            {resumen.total_videos} videos · {resumen.total_evaluaciones} evaluaciones activas
          </p>
        </div>
      </div>

      {/* Gráfica de Calificaciones por Evaluación + Encuesta */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-[#191c1e]">
              Calificaciones por Evaluación A/B/C
            </h2>
            <span className="text-xs text-[#444653] tabular-nums">Escala 0.00 a 5.00</span>
          </div>

          <div className="space-y-3.5">
            {grafica.map((item) => (
              <div key={item.id_evaluacion} className="space-y-1.5">
                <div className="flex items-center justify-between gap-4 text-xs">
                  <button
                    type="button"
                    onClick={() => onOpenEvaluacion(item.id_evaluacion)}
                    className="font-semibold text-[#191c1e] hover:text-[#4f46e5] text-left truncate"
                  >
                    {item.titulo}
                  </button>
                  <span className="font-mono-num text-[#1e40af] font-semibold shrink-0">
                    {Number(item.calificacion).toFixed(2)} / 5.00 ({Number(item.porcentaje).toFixed(0)}%)
                  </span>
                </div>
                <div className="h-3 bg-[#f2f4f6] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.calificacion >= 4
                        ? 'bg-[#10b981]'
                        : item.calificacion > 0
                          ? 'bg-[#4f46e5]'
                          : 'bg-slate-300'
                    }`}
                    style={{ width: `${Math.max(item.porcentaje, item.completada ? 6 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Encuesta de satisfacción */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
          <h2 className="font-display text-xl font-semibold text-[#191c1e]">Encuesta de Satisfacción</h2>
          <p className="text-sm text-[#444653]">
            Cuéntanos cómo te pareció la claridad de los videos y evaluaciones en A.B.A.
          </p>

          <form onSubmit={submitEncuesta} className="space-y-4">
            <div>
              <span className="block text-xs font-semibold text-[#444653] mb-2">Calificación general</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    aria-label={`${n} estrellas`}
                    className={`p-2 rounded-lg border transition ${
                      n <= stars
                        ? 'border-[#f59e0b] bg-[#fffbeb] text-[#b45309]'
                        : 'border-slate-200 text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Star className="w-5 h-5" fill={n <= stars ? '#f59e0b' : 'none'} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="encuesta-comentario" className="block text-xs font-semibold text-[#444653] mb-1.5">
                Observaciones (opcional)
              </label>
              <textarea
                id="encuesta-comentario"
                rows={3}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="¿Qué saber te gustó más?"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#4f46e5] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold transition"
            >
              Enviar encuesta
            </button>

            {surveySaved && (
              <p className="text-xs font-semibold text-[#047857] inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>¡Gracias! Tu opinión fue registrada.</span>
              </p>
            )}
          </form>
        </section>
      </div>

      {/* Historial de puntajes */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[#191c1e]">Historial de Puntajes</h2>
          <span className="text-xs text-[#444653] tabular-nums">{puntajes.length} registro(s)</span>
        </div>

        {puntajes.length === 0 ? (
          <p className="p-6 text-sm text-[#444653]">
            Aún no tienes evaluaciones registradas. Selecciona un saber para presentar tu primera evaluación.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2f4f6] text-xs text-[#444653] border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Evaluación</th>
                  <th className="px-6 py-3 font-semibold">Saber</th>
                  <th className="px-6 py-3 font-semibold">Grado</th>
                  {user.nombre_rol !== 'Estudiante' && <th className="px-6 py-3 font-semibold">Estudiante</th>}
                  <th className="px-6 py-3 font-semibold">Calificación</th>
                  <th className="px-6 py-3 font-semibold">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {puntajes.map((p) => (
                  <tr key={p.id_puntaje} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-medium text-[#191c1e]">{p.evaluacion_titulo}</td>
                    <td className="px-6 py-3.5 text-[#444653]">{p.saber_titulo}</td>
                    <td className="px-6 py-3.5 text-[#444653]">{p.nombre_grado}</td>
                    {user.nombre_rol !== 'Estudiante' && (
                      <td className="px-6 py-3.5 text-[#191c1e]">
                        {p.nombre} {p.apellido}
                      </td>
                    )}
                    <td className="px-6 py-3.5 font-mono-num font-semibold text-[#1e40af]">
                      {Number(p.calificacion).toFixed(2)} / 5.00
                    </td>
                    <td className="px-6 py-3.5 font-mono-num text-xs text-[#444653]">{p.fecha_realizacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
