import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Heart,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { computeTimelineSegment, getLessonPlanForVideo } from '../lib/didacticLessons';
import type { GrantPointsResult, VideoItem } from '../types';
import { useActivityTimer } from '../context/TimeModuleContext';
import { ActivityTimeSummary } from './TimeModuleWidgets';
import { DidacticVideoCanvas } from './DidacticVideoCanvas';

interface VideoPlayerViewProps {
  videoId: number | null;
  onSelectVideo: (id: number) => void;
  onOpenSaber: (saberId: number) => void;
  onOpenEvaluacion: (evalId: number) => void;
  onPointsUpdated?: (newBalance: number) => void;
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({
  videoId,
  onSelectVideo,
  onOpenSaber,
  onOpenEvaluacion,
  onPointsUpdated,
}) => {
  const [allVideos, setAllVideos] = useState<VideoItem[]>([]);
  const [favoriteVideos, setFavoriteVideos] = useState<VideoItem[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'relacionados' | 'favoritos'>('relacionados');
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [relacionados, setRelacionados] = useState<VideoItem[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<Array<{ id_evaluacion: number; titulo: string }>>([]);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<0.75 | 1 | 1.25>(1);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [exportingVideo, setExportingVideo] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [videoCompleted, setVideoCompleted] = useState(false);
  const [pointsNotice, setPointsNotice] = useState<GrantPointsResult | null>(null);
  const [completingVideo, setCompletingVideo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const completionRequestedRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSpokenStepRef = useRef<number | null>(null);
  const viewSessionIdRef = useRef<string>('');
  const watchedSecondsRef = useRef<number>(0);
  const maxPositionRef = useRef<number>(0);
  const lastSentWatchedRef = useRef<number>(-1);

  const activityDurationMs = useActivityTimer(
    `video-${videoId ?? 'none'}`,
    !loading && activeVideo !== null && !videoCompleted,
    videoCompleted
  );

  const refreshFavorites = useCallback(async () => {
    try {
      const res = await apiFetch('/api/videos/favoritos');
      if (!res.ok) return;
      const d = await res.json();
      if (Array.isArray(d.favoritos)) {
        setFavoriteVideos(d.favoritos);
      }
    } catch {
      // No bloquear el reproductor si falla la carga secundaria de favoritos
    }
  }, []);

  useEffect(() => {
    void refreshFavorites();
  }, [refreshFavorites]);

  useEffect(() => {
    apiFetch('/api/videos')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No autorizado');
        return d;
      })
      .then((d) => {
        if (Array.isArray(d.videos)) {
          setAllVideos(d.videos);
          if (!videoId && d.videos.length > 0) {
            onSelectVideo(d.videos[0].id_video);
          }
        }
      })
      .catch(() => {});
  }, [videoId, onSelectVideo]);

  useEffect(() => {
    if (!videoId) return;
    const storageKey = `aba_video_view_${videoId}`;
    let sid = '';
    try {
      const existing = window.sessionStorage.getItem(storageKey);
      if (existing) {
        sid = existing;
      } else {
        sid =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? `vw-${crypto.randomUUID()}`
            : `vw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        window.sessionStorage.setItem(storageKey, sid);
      }
    } catch {
      sid = `vw-${Date.now()}`;
    }
    viewSessionIdRef.current = sid;
    watchedSecondsRef.current = 0;
    maxPositionRef.current = 0;
    lastSentWatchedRef.current = -1;

    setLoading(true);
    setPlaying(false);
    setElapsed(0);
    setVideoCompleted(false);
    setIsFavorite(false);
    setPointsNotice(null);
    setExportNotice(null);
    lastSpokenStepRef.current = null;
    completionRequestedRef.current = null;
    setError(null);

    apiFetch(`/api/videos/${videoId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Video no encontrado');
        setActiveVideo(d.video);
        setRelacionados(d.relacionados || []);
        setEvaluaciones(d.evaluaciones || []);
        setVideoCompleted(Boolean(d.completado_por_usuario));
        setIsFavorite(Boolean(d.es_favorito));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [videoId]);

  const handleToggleFavorite = useCallback(
    async (targetVideo: VideoItem, currentStatus: boolean) => {
      if (togglingFavorite) return;
      const nextStatus = !currentStatus;
      setTogglingFavorite(true);

      // Reflejo inmediato en la interfaz
      if (activeVideo && targetVideo.id_video === activeVideo.id_video) {
        setIsFavorite(nextStatus);
      }
      setFavoriteVideos((prev) => {
        if (nextStatus) {
          if (prev.some((v) => v.id_video === targetVideo.id_video)) return prev;
          return [{ ...targetVideo, es_favorito: true }, ...prev];
        }
        return prev.filter((v) => v.id_video !== targetVideo.id_video);
      });

      try {
        const res = await apiFetch(`/api/videos/${targetVideo.id_video}/favorito`, {
          method: nextStatus ? 'POST' : 'DELETE',
        });
        if (!res.ok) {
          throw new Error('No se pudo actualizar favoritos');
        }
        void refreshFavorites();
      } catch {
        // Revertir si falló en el servidor
        if (activeVideo && targetVideo.id_video === activeVideo.id_video) {
          setIsFavorite(currentStatus);
        }
        void refreshFavorites();
      } finally {
        setTogglingFavorite(false);
      }
    },
    [activeVideo, refreshFavorites, togglingFavorite]
  );

  // Escala visual didáctica: mantiene duración registrada en DB para puntos/progreso
  const totalDuration = activeVideo?.duracion_segundos || 180;

  const lessonPlan = useMemo(
    () =>
      activeVideo
        ? getLessonPlanForVideo(activeVideo)
        : getLessonPlanForVideo({
            id_video: 0,
            titulo: 'Cápsula educativa',
            saber_titulo: '',
            url_video: '',
          }),
    [activeVideo]
  );

  const segment = useMemo(
    () => computeTimelineSegment(lessonPlan, elapsed, totalDuration),
    [lessonPlan, elapsed, totalDuration]
  );

  const sendViewProgress = useCallback(
    (targetVideoId: number, force = false, keepalive = false) => {
      const watched = Math.round(watchedSecondsRef.current);
      if (!force && watched <= 0) return;
      if (!force && watched === lastSentWatchedRef.current) return;
      lastSentWatchedRef.current = watched;
      void apiFetch(`/api/videos/${targetVideoId}/visualizacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive,
        body: JSON.stringify({
          session_view_id: viewSessionIdRef.current || undefined,
          duracion_vista_segundos: watched,
          posicion_max_segundos: Math.round(maxPositionRef.current),
        }),
      }).catch(() => {});
    },
    []
  );

  const markVideoCompleted = useCallback(
    async (targetVideoId: number) => {
      if (completionRequestedRef.current === targetVideoId || completingVideo) return;
      completionRequestedRef.current = targetVideoId;
      setCompletingVideo(true);
      try {
        const res = await apiFetch(`/api/videos/${targetVideoId}/completar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_view_id: viewSessionIdRef.current || undefined,
            duracion_vista_segundos: Math.max(Math.round(watchedSecondsRef.current), totalDuration),
            posicion_max_segundos: totalDuration,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as GrantPointsResult;
        setVideoCompleted(true);
        setPointsNotice(data);
        if (typeof data.saldo_actual === 'number') {
          onPointsUpdated?.(data.saldo_actual);
        }
      } catch {
        completionRequestedRef.current = null;
      } finally {
        setCompletingVideo(false);
      }
    },
    [completingVideo, onPointsUpdated, totalDuration]
  );

  // Reproducción continua y pausada a 60fps para animaciones suaves de causa y efecto
  useEffect(() => {
    if (!playing) {
      if (activeVideo && watchedSecondsRef.current > 0) {
        sendViewProgress(activeVideo.id_video, true);
      }
      return;
    }
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const realDt = Math.min(0.25, (now - lastTime) / 1000);
      const dtSec = realDt * playbackRate;
      lastTime = now;
      watchedSecondsRef.current += realDt;
      setElapsed((prev) => {
        const next = prev + dtSec;
        maxPositionRef.current = Math.max(maxPositionRef.current, Math.min(totalDuration, next));
        if (next >= totalDuration) {
          setPlaying(false);
          return totalDuration;
        }
        return next;
      });
      rafId = window.requestAnimationFrame(tick);
    };

    const heartbeat = window.setInterval(() => {
      if (activeVideo) {
        sendViewProgress(activeVideo.id_video, false);
      }
    }, 10000);

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(heartbeat);
    };
  }, [playing, totalDuration, playbackRate, activeVideo, sendViewProgress]);

  useEffect(() => {
    if (!activeVideo) return;
    const onPageHide = () => {
      sendViewProgress(activeVideo.id_video, false, true);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      sendViewProgress(activeVideo.id_video, false, true);
    };
  }, [activeVideo, sendViewProgress]);

  useEffect(() => {
    if (activeVideo && elapsed >= totalDuration && totalDuration > 0 && !videoCompleted) {
      void markVideoCompleted(activeVideo.id_video);
    }
  }, [activeVideo, elapsed, totalDuration, videoCompleted, markVideoCompleted]);

  // Narración guiada opcional por voz del navegador (sin música de fondo)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!voiceEnabled || !playing) {
      window.speechSynthesis.cancel();
      if (!voiceEnabled) lastSpokenStepRef.current = null;
      return;
    }
    if (lastSpokenStepRef.current !== segment.sceneIndex) {
      lastSpokenStepRef.current = segment.sceneIndex;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        `${segment.scene.shortTitle}. ${segment.scene.narration}`
      );
      utterance.lang = 'es-ES';
      utterance.rate = playbackRate === 1.25 ? 1.05 : playbackRate === 0.75 ? 0.82 : 0.92;
      window.speechSynthesis.speak(utterance);
    }
  }, [voiceEnabled, playing, segment.sceneIndex, segment.scene.shortTitle, segment.scene.narration, playbackRate]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const jumpToScene = (idx: 0 | 1 | 2) => {
    const startSec = (idx / 3) * totalDuration + 0.05;
    setElapsed(Math.min(totalDuration, startSec));
    lastSpokenStepRef.current = null;
  };

  const handleExportClip = async () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setExportNotice('Tu navegador no admite exportación directa de video desde lienzo.');
      return;
    }
    setExportingVideo(true);
    setExportNotice('Grabando clip de los 3 pasos (9 s)...');
    setPlaying(false);

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const donePromise = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();
      const clipMs = 9000;
      const start = performance.now();

      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          const frac = Math.min(1, (now - start) / clipMs);
          setElapsed(frac * totalDuration);
          if (frac < 1) {
            window.requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        window.requestAnimationFrame(step);
      });

      recorder.stop();
      await donePromise;

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `capsula-${lessonPlan.topicKey}.webm`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportNotice('Video descargado en formato WebM.');
    } catch {
      setExportNotice('No fue posible exportar el video en este navegador.');
    } finally {
      setExportingVideo(false);
    }
  };

  const progressPct = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;

  if (loading && !activeVideo) {
    return <div className="py-16 text-center text-sm text-[#444653]">Cargando reproductor educativo...</div>;
  }

  if (error || !activeVideo) {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
        <p className="font-display text-3xl font-bold text-[#1e40af]">404</p>
        <p className="text-base font-semibold text-[#191c1e]">{error || 'Video no disponible'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onOpenSaber(activeVideo.id_saber)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1e40af] hover:underline whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a {activeVideo.saber_titulo}</span>
        </button>

        {evaluaciones[0] && (
          <button
            type="button"
            onClick={() => onOpenEvaluacion(evaluaciones[0].id_evaluacion)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold transition whitespace-nowrap shrink-0"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Ir a {evaluaciones[0].titulo}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Escenario principal de reproducción visual */}
        <div className="lg:col-span-8 space-y-5">
          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200 card-elevation">
            {/* Lienzo animado sobrio de causa y efecto */}
            <DidacticVideoCanvas
              plan={lessonPlan}
              segment={segment}
              playing={playing}
              canvasRefExternal={canvasRef}
            />

            {/* Controles del reproductor y navegación por pasos */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 space-y-4">
              {/* Línea de tiempo interactiva */}
              <div className="space-y-1.5">
                <input
                  type="range"
                  min={0}
                  max={totalDuration}
                  step={0.5}
                  value={elapsed}
                  aria-label="Progreso del video"
                  onChange={(e) => {
                    lastSpokenStepRef.current = null;
                    setElapsed(Number(e.target.value));
                  }}
                  className="w-full accent-[#1e40af] cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs text-[#444653] tabular-nums">
                  <span>{formatClock(elapsed)}</span>
                  <span>
                    Paso {segment.sceneIndex + 1} de 3 · {Math.round(progressPct)}% completado
                  </span>
                  <span>{formatClock(totalDuration)}</span>
                </div>
              </div>

              {/* Barra de controles principales */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    disabled={exportingVideo}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e40af] hover:bg-[#1d4ed8] text-white font-semibold text-xs transition whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>
                      {playing ? 'Pausar' : elapsed > 0 && elapsed < totalDuration ? 'Continuar' : 'Reproducir'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToScene(Math.max(0, segment.sceneIndex - 1) as 0 | 1 | 2)}
                    disabled={segment.sceneIndex === 0 || exportingVideo}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[#191c1e] text-xs font-medium transition whitespace-nowrap shrink-0 disabled:opacity-40"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                    <span>Anterior</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToScene(Math.min(2, segment.sceneIndex + 1) as 0 | 1 | 2)}
                    disabled={segment.sceneIndex === 2 || exportingVideo}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[#191c1e] text-xs font-medium transition whitespace-nowrap shrink-0 disabled:opacity-40"
                  >
                    <span>Siguiente</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>

                  {elapsed > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setElapsed(0);
                        lastSpokenStepRef.current = null;
                      }}
                      disabled={exportingVideo}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[#444653] text-xs font-medium transition whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reiniciar</span>
                    </button>
                  )}
                </div>

                {/* Ritmo, narración sin música y descarga */}
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label="Velocidad de reproducción"
                    className="inline-flex items-center p-0.5 bg-slate-200/70 rounded-lg"
                  >
                    {([0.75, 1, 1.25] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackRate(rate)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 tabular-nums ${
                          playbackRate === rate
                            ? 'bg-white text-[#191c1e] shadow-sm'
                            : 'text-[#444653] hover:text-[#191c1e]'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setVoiceEnabled((v) => !v)}
                    aria-pressed={voiceEnabled}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition whitespace-nowrap shrink-0 ${
                      voiceEnabled
                        ? 'border-[#1e40af] bg-[#eff6ff] text-[#1e40af]'
                        : 'border-slate-200 bg-white text-[#444653] hover:text-[#191c1e]'
                    }`}
                  >
                    {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    <span>{voiceEnabled ? 'Voz activa' : 'Narración'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleExportClip()}
                    disabled={exportingVideo}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[#191c1e] text-xs font-medium transition whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportingVideo ? 'Exportando...' : 'Descargar WebM'}</span>
                  </button>
                </div>
              </div>

              {exportNotice && (
                <p className="text-xs text-[#444653]">{exportNotice}</p>
              )}

              {/* Selector progresivo de los 3 pasos pedagógicos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                {lessonPlan.scenes.map((sc, idx) => {
                  const isCurrent = segment.sceneIndex === idx;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => jumpToScene(idx as 0 | 1 | 2)}
                      className={`text-left p-3 rounded-xl border transition ${
                        isCurrent
                          ? 'bg-white border-[#1e40af] text-[#191c1e]'
                          : 'bg-slate-50/70 border-slate-200 text-[#444653] hover:bg-white'
                      }`}
                    >
                      <p className="text-xs font-mono-num text-[#1e40af] font-semibold">
                        {sc.stepLabel}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold truncate">{sc.shortTitle}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#444653] tabular-nums">
                {activeVideo.nombre_grado} · {activeVideo.saber_titulo} · Duración {formatClock(totalDuration)}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={togglingFavorite}
                  aria-pressed={isFavorite}
                  onClick={() => void handleToggleFavorite(activeVideo, isFavorite)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    isFavorite
                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'border-slate-200 bg-white text-[#444653] hover:text-[#191c1e] hover:bg-slate-50'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-600 text-rose-600' : ''}`} />
                  <span>{isFavorite ? 'En favoritos' : 'Guardar favorito'}</span>
                </button>

                {videoCompleted ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#047857]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {pointsNotice?.otorgado
                        ? `+${pointsNotice.total_puntos} pts ganados (${pointsNotice.puntos_base} base + ${pointsNotice.puntos_adicionales} extra)`
                        : 'Video completado · Puntos acreditados'}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={completingVideo}
                    onClick={() => {
                      setElapsed(totalDuration);
                      setPlaying(false);
                      void markVideoCompleted(activeVideo.id_video);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#10b981] text-[#047857] hover:bg-[#ecfdf5] text-xs font-semibold transition disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{completingVideo ? 'Registrando...' : 'Finalizar video y reclamar puntos'}</span>
                  </button>
                )}
              </div>
            </div>

            <h1 className="font-display text-2xl font-bold text-[#191c1e] text-balance">
              {activeVideo.titulo}
            </h1>
            {videoCompleted && (
              <ActivityTimeSummary
                durationMs={activityDurationMs}
                label="Tiempo empleado en este video"
              />
            )}
            <p className="text-sm text-[#444653] leading-relaxed">
              {lessonPlan.centralIdea}
            </p>
            <p className="pt-1 text-xs text-slate-500 font-mono-num truncate">
              Origen registrado: {activeVideo.url_video}
            </p>
          </div>
        </div>

        {/* Barra lateral de videos relacionados y acceso rápido a favoritos */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg" role="tablist" aria-label="Lista de videos">
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'relacionados'}
                onClick={() => setSidebarTab('relacionados')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 ${
                  sidebarTab === 'relacionados'
                    ? 'bg-white text-[#191c1e] shadow-sm'
                    : 'text-[#444653] hover:text-[#191c1e]'
                }`}
              >
                Relacionados
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === 'favoritos'}
                onClick={() => setSidebarTab('favoritos')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap shrink-0 tabular-nums ${
                  sidebarTab === 'favoritos'
                    ? 'bg-white text-[#191c1e] shadow-sm'
                    : 'text-[#444653] hover:text-[#191c1e]'
                }`}
              >
                Mis favoritos ({favoriteVideos.length})
              </button>
            </div>
            <span className="text-xs text-[#444653] tabular-nums">{allVideos.length} videos</span>
          </div>

          {sidebarTab === 'relacionados' ? (
            <div className="space-y-3">
              {relacionados.map((rel) => (
                <button
                  key={rel.id_video}
                  type="button"
                  onClick={() => onSelectVideo(rel.id_video)}
                  className="w-full text-left bg-white border border-slate-200 hover:border-[#4f46e5] rounded-xl p-4 card-elevation flex items-center gap-3.5 transition"
                >
                  <div className="w-16 h-12 rounded-lg bg-[#eff6ff] text-[#1e40af] flex items-center justify-center shrink-0">
                    <Play className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[#444653] tabular-nums truncate">
                      {rel.nombre_grado} · {formatClock(rel.duracion_segundos || 180)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[#191c1e] truncate">{rel.titulo}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : favoriteVideos.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-1.5">
              <p className="text-sm font-semibold text-[#191c1e]">Aún no tienes videos favoritos</p>
              <p className="text-xs text-[#444653]">
                Pulsa &ldquo;Guardar favorito&rdquo; en cualquier video para acceder rápido desde aquí.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {favoriteVideos.map((fav) => (
                <div
                  key={fav.id_video}
                  className="bg-white border border-slate-200 hover:border-[#4f46e5] rounded-xl p-4 card-elevation flex items-center gap-3 transition"
                >
                  <button
                    type="button"
                    onClick={() => onSelectVideo(fav.id_video)}
                    className="flex-1 min-w-0 text-left flex items-center gap-3.5"
                  >
                    <div className="w-14 h-11 rounded-lg bg-[#eff6ff] text-[#1e40af] flex items-center justify-center shrink-0">
                      <Play className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[#444653] tabular-nums truncate">
                        {fav.nombre_grado} · {formatClock(fav.duracion_segundos || 180)}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-[#191c1e] truncate">{fav.titulo}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    title="Quitar de favoritos"
                    aria-label={`Quitar ${fav.titulo} de favoritos`}
                    onClick={() => void handleToggleFavorite(fav, true)}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 transition shrink-0"
                  >
                    <Heart className="w-4 h-4 fill-rose-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
