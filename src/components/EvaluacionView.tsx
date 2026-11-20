import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AuthUser, EvaluacionResultado, LeaderboardEntry, PreguntaItem } from '../types';
import { LeaderboardSection } from './LeaderboardSection';
import { useActivityTimer } from '../context/TimeModuleContext';
import { ActivityTimeSummary } from './TimeModuleWidgets';

interface EvaluacionMeta {
  id_evaluacion: number;
  titulo: string;
  instrucciones: string | null;
  id_saber: number;
  saber_titulo: string;
  id_grado: number;
  nombre_grado: string;
}

interface EvaluacionViewProps {
  evaluacionId: number;
  user: AuthUser;
  onBackToSaber: (saberId: number) => void;
  onGoToProgress: () => void;
  onPointsUpdated?: (newBalance: number) => void;
}

const PedagogicalVisual: React.FC<{ idSaber: number; enunciado: string }> = ({ idSaber, enunciado }) => {
  // Representación visual interactiva adaptada al saber (manzanas, figuras, colores, reloj, etc.)
  if (idSaber === 1 || enunciado.includes('🍎')) {
    return (
      <div className="bg-[#f2f4f6] rounded-xl p-5 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center justify-center gap-5">
          {[1, 2, 3].map((n) => (
            <svg key={n} viewBox="0 0 64 64" className="w-14 h-14" aria-label={`Manzana ${n}`}>
              <path d="M32 14 C35 6, 44 6, 42 13 C38 15, 34 15, 32 14 Z" fill="#10b981" />
              <rect x="30.5" y="10" width="3" height="8" rx="1.5" fill="#78350f" />
              <path
                d="M32 18 C22 15, 12 22, 13 35 C14 48, 23 55, 32 52 C41 55, 50 48, 51 35 C52 22, 42 15, 32 18 Z"
                fill="#dc2626"
              />
              <ellipse cx="23" cy="28" rx="3" ry="6" transform="rotate(-15 23 28)" fill="#fca5a5" opacity="0.55" />
            </svg>
          ))}
        </div>
        <p className="text-xs font-medium text-[#444653]">Cuenta cada manzana en voz alta antes de elegir</p>
      </div>
    );
  }

  if (idSaber === 5) {
    return (
      <div className="bg-[#f2f4f6] rounded-xl p-5 flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          {[1, 2].map((i) => (
            <span key={i} className="w-8 h-8 rounded-full bg-[#dc2626] inline-block border-2 border-white shadow-sm" />
          ))}
        </div>
        <span className="font-display text-2xl font-bold text-[#1e40af]">+</span>
        <div className="flex items-center gap-2">
          {[1, 2].map((i) => (
            <span key={i} className="w-8 h-8 rounded-full bg-[#dc2626] inline-block border-2 border-white shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  if (idSaber === 4) {
    return (
      <div className="bg-[#f2f4f6] rounded-xl p-5 flex items-center justify-center gap-8">
        <div className="w-12 h-12 bg-[#1e40af] rounded-md" title="Cuadrado" />
        <div className="w-12 h-12 bg-[#10b981] rounded-full" title="Círculo" />
        <svg viewBox="0 0 48 48" className="w-12 h-12">
          <polygon points="24,4 44,44 4,44" fill="#f59e0b" />
        </svg>
      </div>
    );
  }

  if (idSaber === 10) {
    return (
      <div className="bg-[#f2f4f6] rounded-xl p-5 flex items-center justify-center">
        <svg viewBox="0 0 120 120" className="w-28 h-28" aria-label="Reloj marcando las 3:00">
          <circle cx="60" cy="60" r="52" fill="#ffffff" stroke="#1e40af" strokeWidth="4" />
          <text x="60" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill="#191c1e">12</text>
          <text x="100" y="64" textAnchor="middle" fontSize="11" fontWeight="700" fill="#191c1e">3</text>
          <text x="60" y="106" textAnchor="middle" fontSize="11" fontWeight="700" fill="#191c1e">6</text>
          <text x="20" y="64" textAnchor="middle" fontSize="11" fontWeight="700" fill="#191c1e">9</text>
          <line x1="60" y1="60" x2="60" y2="26" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" />
          <line x1="60" y1="60" x2="88" y2="60" stroke="#191c1e" strokeWidth="4" strokeLinecap="round" />
          <circle cx="60" cy="60" r="4" fill="#1e40af" />
        </svg>
      </div>
    );
  }

  return null;
};

export const EvaluacionView: React.FC<EvaluacionViewProps> = ({
  evaluacionId,
  user,
  onBackToSaber,
  onGoToProgress,
  onPointsUpdated,
}) => {
  const [evaluacion, setEvaluacion] = useState<EvaluacionMeta | null>(null);
  const [preguntas, setPreguntas] = useState<PreguntaItem[]>([]);
  const [historial, setHistorial] = useState<Array<{ id_puntaje: number; calificacion: number; fecha_realizacion: string }>>([]);
  const [selected, setSelected] = useState<Record<number, 'A' | 'B' | 'C'>>({});
  const [resultado, setResultado] = useState<EvaluacionResultado | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);

  const activityDurationMs = useActivityTimer(
    `evaluacion-${evaluacionId}-${attemptNumber}`,
    !loading && preguntas.length > 0 && resultado === null,
    resultado !== null
  );

  useEffect(() => {
    setLoading(true);
    setLoadingLeaderboard(true);
    setResultado(null);
    setSelected({});
    setError(null);

    apiFetch(`/api/evaluaciones/${evaluacionId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Evaluación no encontrada');
        setEvaluacion(data.evaluacion);
        setPreguntas(data.preguntas || []);
        setHistorial(data.historial || []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    apiFetch(`/api/evaluaciones/${evaluacionId}/leaderboard`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        if (Array.isArray(data.entries)) {
          setLeaderboard(data.entries);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));
  }, [evaluacionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    for (const p of preguntas) {
      if (!selected[p.id_respuesta]) {
        setError('Selecciona una opción (A, B o C) antes de verificar tu respuesta.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/evaluaciones/${evaluacionId}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo procesar la evaluación.');
        return;
      }
      setResultado(data);
      if (data.puntos_otorgados && typeof data.puntos_otorgados.saldo_actual === 'number') {
        onPointsUpdated?.(data.puntos_otorgados.saldo_actual);
      }
      if (data.puntaje_guardado) {
        setHistorial((prev) => [data.puntaje_guardado, ...prev].slice(0, 5));
      }
      if (Array.isArray(data.leaderboard)) {
        setLeaderboard(data.leaderboard);
      } else {
        const lbRes = await apiFetch(`/api/evaluaciones/${evaluacionId}/leaderboard`);
        if (lbRes.ok) {
          const lbData = await lbRes.json();
          if (Array.isArray(lbData.entries)) {
            setLeaderboard(lbData.entries);
          }
        }
      }
    } catch {
      setError('Error de red al enviar las respuestas.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setResultado(null);
    setSelected({});
    setError(null);
    setAttemptNumber((n) => n + 1);
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#444653]">Cargando evaluación interactiva...</div>;
  }

  if (error && !evaluacion) {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
        <p className="font-display text-3xl font-bold text-[#1e40af]">404</p>
        <p className="text-base font-semibold text-[#191c1e]">{error}</p>
      </div>
    );
  }

  if (!evaluacion) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <button
          type="button"
          onClick={() => onBackToSaber(evaluacion.id_saber)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1e40af] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a {evaluacion.saber_titulo}</span>
        </button>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#4f46e5]">
              {evaluacion.nombre_grado} · {evaluacion.saber_titulo}
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold text-[#191c1e]">{evaluacion.titulo}</h1>
            {evaluacion.instrucciones && (
              <p className="mt-1 text-sm text-[#444653]">{evaluacion.instrucciones}</p>
            )}
          </div>
          <p className="text-xs font-medium text-[#444653] tabular-nums">
            {preguntas.length} pregunta(s) · Formato ABC
          </p>
        </div>
      </div>

      {/* Barra de progreso simple */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
        <span className="text-xs font-semibold text-[#444653]">Avance de respuesta</span>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#10b981] transition-all duration-300"
            style={{
              width: `${preguntas.length ? (Object.keys(selected).length / preguntas.length) * 100 : 0}%`,
            }}
          />
        </div>
        <span className="text-xs font-semibold text-[#191c1e] tabular-nums">
          {Object.keys(selected).length} / {preguntas.length}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]"
        >
          {error}
        </div>
      )}

      {resultado && (
        <div
          className={`rounded-2xl border p-6 space-y-4 ${
            resultado.calificacion >= 3
              ? 'border-[#10b981] bg-[#ecfdf5]'
              : 'border-[#f59e0b] bg-[#fffbeb]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {resultado.calificacion >= 3 ? (
                <CheckCircle2 className="w-7 h-7 text-[#10b981] shrink-0" />
              ) : (
                <XCircle className="w-7 h-7 text-[#ba1a1a] shrink-0" />
              )}
              <div>
                <h2 className="font-display text-xl font-bold text-[#191c1e]">
                  {resultado.calificacion >= 3
                    ? '¡Excelente desempeño!'
                    : 'Revisa la retroalimentación e inténtalo de nuevo'}
                </h2>
                <p className="text-xs text-[#444653] tabular-nums">
                  Aciertos: {resultado.aciertos} de {resultado.total_preguntas} ({resultado.porcentaje}%)
                  {resultado.puntaje_guardado
                    ? ` · Puntaje #${resultado.puntaje_guardado.id_puntaje} registrado para ${user.nombre}`
                    : ''}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs font-semibold text-[#444653]">Calificación</p>
              <p className="font-display text-3xl font-bold text-[#1e40af] tabular-nums">
                {resultado.calificacion.toFixed(2)} / 5.00
              </p>
            </div>
          </div>

          <ActivityTimeSummary durationMs={activityDurationMs} />

          {resultado.puntos_otorgados && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              {resultado.puntos_otorgados.otorgado ? (
                <span className="font-semibold text-[#047857]">
                  +{resultado.puntos_otorgados.total_puntos} puntos ganados para la tienda (
                  {resultado.puntos_otorgados.puntos_base} base +{' '}
                  {resultado.puntos_otorgados.puntos_adicionales} adicionales)
                </span>
              ) : (
                <span className="font-medium text-[#444653]">
                  Ya recibiste los puntos de esta evaluación anteriormente (sin duplicación).
                </span>
              )}
              <span className="font-mono-num font-bold text-[#1e40af]">
                Saldo total: {resultado.puntos_otorgados.saldo_actual} pts
              </span>
            </div>
          )}

          <div className="space-y-3">
            {resultado.detalle.map((item) => (
              <div key={item.id_respuesta} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                <p className="text-sm font-semibold text-[#191c1e]">{item.enunciado_pregunta}</p>
                <p
                  className={`text-xs font-semibold ${
                    item.es_correcta ? 'text-[#047857]' : 'text-[#ba1a1a]'
                  }`}
                >
                  {item.es_correcta ? 'Respuesta correcta' : 'Respuesta incorrecta'} · Elegiste la opción{' '}
                  {item.opcion_elegida}
                </p>
                <p className="text-sm text-[#444653]">{item.mensaje}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1e40af] text-[#1e40af] bg-white hover:bg-[#eff6ff] text-xs font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Intentar de nuevo</span>
            </button>
            <button
              type="button"
              onClick={onGoToProgress}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e40af] text-white text-xs font-semibold hover:bg-[#1e3a8a]"
            >
              <span>Ver mi Dashboard de Progreso</span>
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {preguntas.map((pregunta, idx) => {
          const opciones: Array<{ key: 'A' | 'B' | 'C'; text: string }> = [
            { key: 'A', text: pregunta.opcion_a },
            { key: 'B', text: pregunta.opcion_b },
            { key: 'C', text: pregunta.opcion_c },
          ];
          const chosen = selected[pregunta.id_respuesta];

          return (
            <div key={pregunta.id_respuesta} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 card-elevation space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#444653] tabular-nums">
                  Pregunta {idx + 1} de {preguntas.length}
                </p>
                <h2 className="font-display text-2xl font-semibold text-[#191c1e]">
                  {pregunta.enunciado_pregunta}
                </h2>
              </div>

              <PedagogicalVisual idSaber={evaluacion.id_saber} enunciado={pregunta.enunciado_pregunta} />

              <div className="grid grid-cols-1 gap-3">
                {opciones.map((op) => {
                  const isSelected = chosen === op.key;
                  const resultMatch = resultado?.detalle.find((d) => d.id_respuesta === pregunta.id_respuesta);
                  let borderClass = 'border-slate-200 bg-white hover:border-[#4f46e5]';

                  if (resultMatch && isSelected) {
                    borderClass = resultMatch.es_correcta
                      ? 'border-[#10b981] bg-[#ecfdf5]'
                      : 'border-[#ba1a1a] bg-[#ffdad6]/50';
                  } else if (isSelected) {
                    borderClass = 'border-[#4f46e5] bg-[#eef2ff]';
                  }

                  return (
                    <label
                      key={op.key}
                      className={`flex items-center justify-between gap-4 rounded-xl border-2 p-4 cursor-pointer transition ${borderClass}`}
                    >
                      <div className="flex items-center gap-3.5">
                        <input
                          type="radio"
                          name={`pregunta-${pregunta.id_respuesta}`}
                          value={op.key}
                          checked={isSelected}
                          onChange={() =>
                            setSelected((prev) => ({
                              ...prev,
                              [pregunta.id_respuesta]: op.key,
                            }))
                          }
                          className="w-5 h-5 accent-[#4f46e5]"
                        />
                        <span className="w-7 h-7 rounded-lg bg-[#eff6ff] text-[#1e40af] font-display font-bold text-sm inline-flex items-center justify-center shrink-0">
                          {op.key}
                        </span>
                        <span className="text-base font-medium text-[#191c1e]">{op.text}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          type="submit"
          disabled={submitting || preguntas.length === 0}
          className="w-full min-h-[48px] rounded-xl bg-[#10b981] hover:bg-[#059669] text-white font-semibold text-sm px-6 py-3.5 transition disabled:opacity-60"
        >
          {submitting ? 'Validando respuestas...' : 'Verificar respuesta y guardar puntaje'}
        </button>
      </form>

      <LeaderboardSection entries={leaderboard} loading={loadingLeaderboard} />

      {historial.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
          <h3 className="font-display text-lg font-semibold text-[#191c1e]">Tus intentos recientes</h3>
          <div className="divide-y divide-slate-100">
            {historial.map((h) => (
              <div key={h.id_puntaje} className="py-2.5 flex items-center justify-between text-sm">
                <span className="text-[#444653] tabular-nums">{h.fecha_realizacion}</span>
                <span className="font-semibold text-[#1e40af] tabular-nums">
                  {Number(h.calificacion).toFixed(2)} / 5.00
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
