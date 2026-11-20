import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Heart,
  PlayCircle,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  normalizeSearchText,
  searchSaberesCatalog,
  type SaberCategory,
  type SaberCompletionFilter,
  type SaberSearchHit,
} from '../lib/saberesSearch';
import type { AuthUser, Grado, SaberItem } from '../types';

interface SaberesViewProps {
  user: AuthUser;
  selectedSaberId: number | null;
  onSelectSaber: (id: number | null) => void;
  onOpenVideo: (videoId: number) => void;
  onOpenEvaluacion: (evaluacionId: number) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '03:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getSaberVisual(saberId: number): string {
  if (saberId === 4 || saberId === 3) {
    return '/src/assets/images/saber_geometry_visual_1794581670637.jpg';
  }
  if (saberId === 1 || saberId === 5 || saberId === 7) {
    return '/src/assets/images/saber_math_visual_1794581670253.jpg';
  }
  return '/src/assets/images/hero_active_pedagogy_1794581670214.jpg';
}

function HighlightedText({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length || !text) return <>{text}</>;
  const normText = normalizeSearchText(text);
  // Resaltar coincidencias por token preservando mayúsculas/tildes originales cuando la longitud coincide
  const ranges: Array<[number, number]> = [];
  if (normText.length === text.length) {
    for (const token of tokens) {
      if (token.length < 2) continue;
      let idx = normText.indexOf(token);
      while (idx !== -1) {
        ranges.push([idx, idx + token.length]);
        idx = normText.indexOf(token, idx + token.length);
      }
    }
  }
  if (ranges.length === 0) return <>{text}</>;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r[0] > last[1]) {
      merged.push([...r]);
    } else {
      last[1] = Math.max(last[1], r[1]);
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={i} className="bg-indigo-100 text-[#1e40af] font-semibold rounded px-0.5">
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

const QUICK_SEARCH_PROMPTS = [
  '¿Cómo sumar?',
  'vocales',
  'figuras geométricas',
  'animales domésticos',
  'reloj',
];

const CATEGORIES: Array<SaberCategory | 'all'> = [
  'all',
  'Matemáticas y Lógica',
  'Lenguaje y Lectura',
  'Ciencias y Entorno',
];

export const SaberesView: React.FC<SaberesViewProps> = ({
  user,
  selectedSaberId,
  onSelectSaber,
  onOpenVideo,
  onOpenEvaluacion,
}) => {
  const [grados, setGrados] = useState<Grado[]>([]);
  const [saberes, setSaberes] = useState<SaberItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedGrado, setSelectedGrado] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<SaberCategory | 'all'>('all');
  const [completionFilter, setCompletionFilter] = useState<SaberCompletionFilter>('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<{
    saber: SaberItem;
    videos: SaberItem['videos'];
    evaluaciones: SaberItem['evaluaciones'];
  } | null>(null);
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Atajo "/" para enfocar el buscador instantáneamente desde cualquier parte de Saberes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !selectedSaberId &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedSaberId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/api/grados').then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Error cargando grados');
        return d;
      }),
      apiFetch('/api/saberes').then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Error cargando saberes');
        return d;
      }),
      apiFetch('/api/videos/favoritos')
        .then(async (r) => (r.ok ? r.json() : { favoritos: [] }))
        .catch(() => ({ favoritos: [] })),
    ])
      .then(([gData, sData, favData]) => {
        if (Array.isArray(gData.grados)) setGrados(gData.grados);
        if (Array.isArray(favData?.favoritos)) {
          setFavoriteVideoIds(new Set(favData.favoritos.map((f: { id_video: number }) => f.id_video)));
        }
        if (Array.isArray(sData.saberes)) setSaberes(sData.saberes);
      })
      .catch((err: Error) => setError(err.message || 'No fue posible cargar los saberes de aprendizaje.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSaberId) {
      setDetailData(null);
      return;
    }
    setDetailLoading(true);
    setError(null);
    apiFetch(`/api/saberes/${selectedSaberId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Saber no encontrado');
        setDetailData({
          saber: data.saber,
          videos: data.videos || [],
          evaluaciones: data.evaluaciones || [],
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setDetailLoading(false));
  }, [selectedSaberId]);

  const searchOutcome = useMemo(
    () =>
      searchSaberesCatalog({
        saberes,
        query,
        idGrado: selectedGrado,
        categoria: selectedCategory,
        estado: completionFilter,
      }),
    [saberes, query, selectedGrado, selectedCategory, completionFilter]
  );

  const isSearching = query.trim().length > 0;

  const groupedByGrado = useMemo(() => {
    const map = new Map<
      number,
      { gradoLabel: string; seccion: string | null; hits: SaberSearchHit[] }
    >();
    for (const hit of searchOutcome.hits) {
      const s = hit.saber;
      if (!map.has(s.id_grado)) {
        map.set(s.id_grado, {
          gradoLabel: s.nombre_grado,
          seccion: s.seccion,
          hits: [],
        });
      }
      map.get(s.id_grado)!.hits.push(hit);
    }
    return Array.from(map.entries());
  }, [searchOutcome.hits]);

  if (selectedSaberId) {
    if (detailLoading) {
      return (
        <div className="py-16 text-center text-sm text-[#444653]">
          Cargando contenido del saber...
        </div>
      );
    }

    if (error || !detailData) {
      return (
        <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <p className="font-display text-3xl font-bold text-[#1e40af]">404</p>
          <h2 className="font-display text-xl font-semibold text-[#191c1e]">
            {error || 'Saber de aprendizaje no encontrado'}
          </h2>
          <button
            type="button"
            onClick={() => onSelectSaber(null)}
            className="px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-sm font-semibold"
          >
            Volver a Saberes
          </button>
        </div>
      );
    }

    const { saber, videos, evaluaciones } = detailData;

    return (
      <div className="space-y-8">
        <div>
          <button
            type="button"
            onClick={() => onSelectSaber(null)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#1e40af] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Saberes de Aprendizaje</span>
          </button>

          <div className="mt-4 bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-8 flex flex-col justify-center space-y-3">
              <p className="text-xs font-semibold text-[#4f46e5]">
                {saber.nombre_grado} · Jornada {saber.seccion || 'Única'}
              </p>
              <h1 className="font-display text-3xl font-bold text-[#191c1e] text-balance">{saber.titulo}</h1>
              <p className="text-base text-[#444653] leading-relaxed">
                {saber.descripcion || 'Contenido pedagógico interactivo diseñado para el aprendizaje activo.'}
              </p>
            </div>
            <div className="lg:col-span-5 bg-[#f2f4f6] min-h-[220px]">
              <img
                src={getSaberVisual(saber.id_saber)}
                alt={saber.titulo}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Videos asociados */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-[#1e40af]">Videos Educativos</h2>
              <span className="text-xs text-[#444653] tabular-nums">{videos.length} recurso(s)</span>
            </div>

            {videos.length === 0 ? (
              <p className="text-sm text-[#444653] py-4">Aún no hay videos cargados para este saber.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {videos.map((video) => {
                  const isFav = favoriteVideoIds.has(video.id_video);
                  return (
                    <div key={video.id_video} className="py-4 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[#191c1e] truncate">{video.titulo}</p>
                        <p className="mt-0.5 text-xs text-[#444653] tabular-nums">
                          Duración {formatDuration(video.duracion_segundos)} · Video #{video.id_video}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          aria-pressed={isFav}
                          title={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                          aria-label={isFav ? `Quitar ${video.titulo} de favoritos` : `Guardar ${video.titulo} en favoritos`}
                          onClick={async () => {
                            const nextFav = !isFav;
                            setFavoriteVideoIds((prev) => {
                              const copy = new Set(prev);
                              if (nextFav) copy.add(video.id_video);
                              else copy.delete(video.id_video);
                              return copy;
                            });
                            try {
                              const res = await apiFetch(`/api/videos/${video.id_video}/favorito`, {
                                method: nextFav ? 'POST' : 'DELETE',
                              });
                              if (!res.ok) throw new Error('Error actualizando favorito');
                            } catch {
                              setFavoriteVideoIds((prev) => {
                                const copy = new Set(prev);
                                if (isFav) copy.add(video.id_video);
                                else copy.delete(video.id_video);
                                return copy;
                              });
                            }
                          }}
                          className={`p-2 rounded-lg border transition ${
                            isFav
                              ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                              : 'border-slate-200 bg-white text-[#444653] hover:text-[#191c1e]'
                          }`}
                        >
                          <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-600' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenVideo(video.id_video)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1e40af] text-[#1e40af] hover:bg-[#eff6ff] text-xs font-semibold whitespace-nowrap shrink-0 transition"
                        >
                          <PlayCircle className="w-4 h-4" />
                          <span>Reproducir</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Evaluaciones asociadas */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-[#10b981]">Evaluaciones Interactivas ABC</h2>
              <span className="text-xs text-[#444653] tabular-nums">{evaluaciones.length} actividad(es)</span>
            </div>

            {evaluaciones.length === 0 ? (
              <p className="text-sm text-[#444653] py-4">No hay evaluaciones asociadas a este saber.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {evaluaciones.map((ev) => (
                  <div key={ev.id_evaluacion} className="py-4 first:pt-1 last:pb-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#191c1e] truncate">{ev.titulo}</p>
                      <p className="mt-0.5 text-xs text-[#444653]">
                        {ev.instrucciones || 'Selecciona la opción correcta.'} ·{' '}
                        <span className="tabular-nums">{ev.total_preguntas ?? 1} pregunta(s)</span>
                      </p>
                      {ev.ultimo_puntaje && (
                        <p className="mt-1 text-xs font-semibold text-[#047857] tabular-nums inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Última nota: {Number(ev.ultimo_puntaje.calificacion).toFixed(2)} / 5.00</span>
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenEvaluacion(ev.id_evaluacion)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold whitespace-nowrap shrink-0 transition"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      <span>{ev.ultimo_puntaje ? 'Reintentar' : 'Evaluar'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  function renderSaberCard(hit: SaberSearchHit) {
    const saber = hit.saber;
    const targetVideoId = hit.matchedVideoId ?? saber.videos[0]?.id_video ?? null;
    const targetEvalId = hit.matchedEvaluacionId ?? saber.evaluaciones[0]?.id_evaluacion ?? null;
    const nota = saber.evaluaciones[0]?.ultimo_puntaje?.calificacion;

    return (
      <article
        key={saber.id_saber}
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation flex flex-col justify-between transition hover:border-[#4f46e5]/50"
      >
        <div>
          <div className="h-40 bg-[#f2f4f6] overflow-hidden">
            <img
              src={getSaberVisual(saber.id_saber)}
              alt={saber.titulo}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-6 space-y-2.5">
            <p className="text-xs text-[#444653] tabular-nums">
              {saber.nombre_grado} · {hit.categoria} · {saber.videos.length} video ·{' '}
              {saber.evaluaciones.length} evaluación
            </p>
            <h3 className="font-display text-xl font-semibold text-[#191c1e] leading-snug">
              <HighlightedText text={saber.titulo} tokens={searchOutcome.appliedTokens} />
            </h3>
            <p className="text-sm text-[#444653] leading-relaxed">
              <HighlightedText
                text={saber.descripcion || 'Contenido interactivo de aprendizaje.'}
                tokens={searchOutcome.appliedTokens}
              />
            </p>
            {isSearching && hit.matchContext && (
              <p className="text-xs font-medium text-[#4f46e5] pt-0.5">{hit.matchContext}</p>
            )}
            {nota !== undefined && nota !== null && (
              <p className="pt-1 text-xs font-semibold text-[#047857] tabular-nums inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Calificación registrada: {Number(nota).toFixed(2)} / 5.00</span>
              </p>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-2 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onSelectSaber(saber.id_saber)}
            className="flex-1 min-h-[40px] px-4 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold transition"
          >
            Explorar saber
          </button>
          {targetVideoId && (
            <button
              type="button"
              onClick={() => onOpenVideo(targetVideoId)}
              title="Ver video educativo"
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 hover:border-[#1e40af] text-[#1e40af] text-xs font-semibold transition"
            >
              Video
            </button>
          )}
          {targetEvalId && (
            <button
              type="button"
              onClick={() => onOpenEvaluacion(targetEvalId)}
              title="Ir a evaluación ABC"
              className="min-h-[40px] px-3 py-2 rounded-lg border border-[#10b981] text-[#047857] hover:bg-[#ecfdf5] text-xs font-semibold transition"
            >
              Evaluar
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado y barra de búsqueda inteligente */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#4f46e5]">
            {user.nombre_grado ? `Tu grado actual: ${user.nombre_grado}` : `Catálogo escolar completo · ${user.nombre_rol}`}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#191c1e] text-balance">
            Saberes de Aprendizaje
          </h1>
          <p className="text-sm sm:text-base text-[#444653] max-w-2xl">
            Busca cualquier saber por tema, pregunta, sinónimo o recurso (atajo <kbd className="px-1.5 py-0.5 text-xs bg-white border border-slate-300 rounded">/</kbd>) y accede en un clic a su video o evaluación.
          </p>
        </div>

        <div className="w-full lg:w-96 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej. ¿Cómo sumar?, vocales, alfabeto, reloj..."
            aria-label="Buscar saber"
            className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-9 py-2.5 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none focus:ring-3 focus:ring-[#4f46e5]/15"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-[#191c1e]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Consultas rápidas de ejemplo + filtros facetados */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 card-elevation space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#444653] font-semibold">Búsquedas rápidas:</span>
          {QUICK_SEARCH_PROMPTS.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => setQuery(sample)}
              className="px-2.5 py-1 rounded-md bg-[#f2f4f6] hover:bg-indigo-50 text-[#191c1e] hover:text-[#1e40af] transition"
            >
              {sample}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1 border-t border-slate-100">
          {/* Filtro por área temática */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition ${
                  selectedCategory === cat
                    ? 'bg-[#4f46e5] text-white'
                    : 'bg-[#f7f9fb] border border-slate-200 text-[#444653] hover:text-[#191c1e]'
                }`}
              >
                {cat === 'all' ? 'Todas las áreas' : cat}
              </button>
            ))}
          </div>

          {/* Filtro por grado y estado */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por grado"
              value={selectedGrado === 'all' ? 'all' : String(selectedGrado)}
              onChange={(e) =>
                setSelectedGrado(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
            >
              <option value="all">Todos los grados</option>
              {grados
                .filter((g) => (g.total_saberes ?? 0) > 0)
                .map((g) => (
                  <option key={g.id_grado} value={g.id_grado}>
                    {g.nombre_grado}
                  </option>
                ))}
            </select>

            <select
              aria-label="Filtrar por estado"
              value={completionFilter}
              onChange={(e) => setCompletionFilter(e.target.value as SaberCompletionFilter)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="pendientes">Pendientes por evaluar</option>
              <option value="completados">Ya evaluados</option>
            </select>
          </div>
        </div>
      </div>

      {/* Corrección de errores tipográficos / Quizás quisiste decir */}
      {isSearching && (searchOutcome.usedFuzzyFallback || searchOutcome.didYouMean) && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#1e40af]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>
              {searchOutcome.usedFuzzyFallback
                ? `Mostrando coincidencias aproximadas para "${query.trim()}".`
                : `No se hallaron coincidencias exactas para "${query.trim()}".`}
            </span>
          </div>
          {searchOutcome.didYouMean && (
            <button
              type="button"
              onClick={() => setQuery(searchOutcome.didYouMean!)}
              className="font-semibold underline hover:text-indigo-900"
            >
              Quizás quisiste decir: &ldquo;{searchOutcome.didYouMean}&rdquo;
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-[#444653]">Cargando saberes por grado...</div>
      ) : searchOutcome.hits.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
          <p className="font-display text-lg font-semibold text-[#191c1e]">Sin coincidencias</p>
          <p className="text-sm text-[#444653]">
            Prueba con un término más general, otro sinónimo o restablece los filtros.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSelectedGrado('all');
              setSelectedCategory('all');
              setCompletionFilter('all');
            }}
            className="px-4 py-2 rounded-lg bg-[#4f46e5] text-white text-xs font-semibold"
          >
            Restablecer búsqueda y filtros
          </button>
        </div>
      ) : isSearching ? (
        /* Modo Búsqueda Activa: resultados ordenados estrictamente por relevancia */
        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-slate-200 pb-2.5">
            <h2 className="font-display text-xl font-semibold text-[#1e40af]">
              Resultados ordenados por relevancia
            </h2>
            <span className="text-xs font-medium text-[#444653] tabular-nums">
              {searchOutcome.hits.length} saber(es) encontrado(s)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {searchOutcome.hits.map((hit) => renderSaberCard(hit))}
          </div>
        </section>
      ) : (
        /* Modo Exploración: agrupado por grado escolar */
        <div className="space-y-10">
          {groupedByGrado.map(([gradoId, group]) => (
            <section key={gradoId} className="space-y-4">
              <div className="flex items-baseline justify-between border-b border-slate-200 pb-2.5">
                <h2 className="font-display text-2xl font-semibold text-[#1e40af]">
                  {group.gradoLabel}
                </h2>
                <span className="text-xs font-medium text-[#444653] tabular-nums">
                  Jornada {group.seccion || 'Única'} · {group.hits.length} saber(es)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.hits.map((hit) => renderSaberCard(hit))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
