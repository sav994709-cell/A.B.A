import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  History,
  LogIn,
  Plus,
  Swords,
  Trophy,
  Users,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { apiFetch, getSessionToken } from '../lib/api';
import type {
  AuthUser,
  DuelHistoryItem,
  DuelParticipantView,
  DuelRoomSnapshot,
  SaberItem,
} from '../types';

interface DuelosViewProps {
  user: AuthUser;
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}m ${seconds}s`;
}

function formatClock(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const min = String(Math.floor(safe / 60)).padStart(2, '0');
  const sec = String(safe % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

function formatFecha(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DuelosView({ user }: DuelosViewProps) {
  const [saberes, setSaberes] = useState<SaberItem[]>([]);
  const [selectedSaberId, setSelectedSaberId] = useState<number>(0);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [history, setHistory] = useState<DuelHistoryItem[]>([]);
  const [activeRoom, setActiveRoom] = useState<DuelRoomSnapshot | null>(null);

  const [loadingLobby, setLoadingLobby] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [wsNotice, setWsNotice] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLobbyData = useCallback(async () => {
    setLoadingLobby(true);
    try {
      const [saberesRes, historyRes] = await Promise.all([
        apiFetch('/api/saberes'),
        apiFetch('/api/duelos/historial'),
      ]);
      if (saberesRes.ok) {
        const sData = (await saberesRes.json()) as { saberes: SaberItem[] };
        const disponibles = (sData.saberes ?? []).filter((s) => (s.evaluaciones?.length ?? 0) > 0);
        setSaberes(disponibles);
        if (disponibles.length > 0) {
          setSelectedSaberId((prev) => (prev > 0 ? prev : disponibles[0].id_saber));
        }
      }
      if (historyRes.ok) {
        const hData = (await historyRes.json()) as { duelos: DuelHistoryItem[] };
        setHistory(hData.duelos ?? []);
      }
    } catch {
      setErrorMsg('No se pudo cargar la información de competencias.');
    } finally {
      setLoadingLobby(false);
    }
  }, []);

  useEffect(() => {
    loadLobbyData();
  }, [loadLobbyData]);

  // Conexión WebSocket mientras la sala esté en espera o en curso
  const activeCode = activeRoom?.codigo ?? null;
  const activeStatus = activeRoom?.estado ?? null;

  useEffect(() => {
    if (!activeCode || (activeStatus !== 'esperando' && activeStatus !== 'en_curso')) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getSessionToken();
      const params = new URLSearchParams({ codigo: activeCode });
      if (token) params.set('token', token);
      const wsUrl = `${protocol}//${window.location.host}/ws/duelos?${params.toString()}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) {
          setWsNotice(null);
        }
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(String(event.data)) as {
            type?: string;
            room?: DuelRoomSnapshot;
            error?: string;
            grace_ms?: number;
          };

          if ((data.type === 'duel:state' || data.type === 'duel:finished') && data.room) {
            setActiveRoom(data.room);
            setSubmittingAnswer(false);
            if (data.type === 'duel:finished') {
              setWsNotice(null);
              loadLobbyData();
            }
          } else if (data.type === 'duel:opponent_disconnecting') {
            const secs = Math.max(1, Math.round((data.grace_ms ?? 3500) / 1000));
            setWsNotice(`Tu oponente perdió conexión. Esperando reconexión (${secs}s)...`);
          } else if (data.type === 'duel:error' && data.error) {
            setErrorMsg(data.error);
            setSubmittingAnswer(false);
          }
        } catch {
          // Ignorar mensajes malformados
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (!cancelled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 1000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [activeCode, activeStatus, loadLobbyData]);

  // Cronómetro en vivo durante la partida
  useEffect(() => {
    if (!activeRoom || activeRoom.estado !== 'en_curso' || !activeRoom.iniciada_en_ms) {
      return;
    }
    const me = activeRoom.participantes.find((p) => p.es_usuario_actual);
    if (me?.estado === 'finalizado' && me.tiempo_ms !== null) {
      setElapsedMs(me.tiempo_ms);
      return;
    }

    const startMs = activeRoom.iniciada_en_ms;
    setElapsedMs(Math.max(0, Date.now() - startMs));
    const timer = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startMs));
    }, 250);
    return () => clearInterval(timer);
  }, [activeRoom]);

  async function handleCreateRoom() {
    if (!selectedSaberId || busyAction) return;
    setBusyAction(true);
    setErrorMsg(null);
    setWsNotice(null);
    try {
      const res = await apiFetch('/api/duelos/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_saber: selectedSaberId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'No se pudo crear la sala.');
        return;
      }
      setActiveRoom(data.room as DuelRoomSnapshot);
      loadLobbyData();
    } catch {
      setErrorMsg('Error de conexión al crear la sala.');
    } finally {
      setBusyAction(false);
    }
  }

  async function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    const codigo = joinCodeInput.trim().toUpperCase();
    if (!codigo || busyAction) return;
    setBusyAction(true);
    setErrorMsg(null);
    setWsNotice(null);
    try {
      const res = await apiFetch('/api/duelos/unirse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'No fue posible unirse a la sala.');
        return;
      }
      setJoinCodeInput('');
      setActiveRoom(data.room as DuelRoomSnapshot);
      loadLobbyData();
    } catch {
      setErrorMsg('Error de conexión al unirse a la sala.');
    } finally {
      setBusyAction(false);
    }
  }

  async function handleOpenRoomFromHistory(codigo: string) {
    setBusyAction(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/duelos/${encodeURIComponent(codigo)}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'No se pudo abrir la sala.');
        return;
      }
      setActiveRoom(data.room as DuelRoomSnapshot);
    } catch {
      setErrorMsg('Error de conexión al consultar la competencia.');
    } finally {
      setBusyAction(false);
    }
  }

  async function handleSubmitAnswer(idRespuesta: number, opcion: 'A' | 'B' | 'C') {
    if (!activeRoom || activeRoom.estado !== 'en_curso' || submittingAnswer) return;
    setSubmittingAnswer(true);
    setErrorMsg(null);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'duel:answer',
          id_respuesta: idRespuesta,
          opcion,
        })
      );
      return;
    }

    // Respaldo HTTP si el WebSocket se está reconectando
    try {
      const res = await apiFetch(`/api/duelos/${encodeURIComponent(activeRoom.codigo)}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_respuesta: idRespuesta, opcion }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'No se pudo registrar la respuesta.');
      } else if (data.room) {
        setActiveRoom(data.room as DuelRoomSnapshot);
        if (data.finished_now) {
          loadLobbyData();
        }
      }
    } catch {
      setErrorMsg('Error de red al enviar la respuesta.');
    } finally {
      setSubmittingAnswer(false);
    }
  }

  async function handleCopyCode(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Silencioso en entornos sin acceso al portapapeles
    }
  }

  function handleBackToLobby() {
    setActiveRoom(null);
    setWsNotice(null);
    setErrorMsg(null);
    loadLobbyData();
  }

  const me: DuelParticipantView | undefined = useMemo(
    () => activeRoom?.participantes.find((p) => p.es_usuario_actual),
    [activeRoom]
  );

  const opponent: DuelParticipantView | undefined = useMemo(
    () => activeRoom?.participantes.find((p) => !p.es_usuario_actual),
    [activeRoom]
  );

  const currentQuestion = useMemo(() => {
    if (!activeRoom) return null;
    return activeRoom.preguntas.find((q) => q.mi_opcion === null) ?? null;
  }, [activeRoom]);

  // --- VISTA: SALA ACTIVA / ESPERA / RESULTADO ---
  if (activeRoom) {
    const isWaiting = activeRoom.estado === 'esperando';
    const isPlaying = activeRoom.estado === 'en_curso';
    const isFinished = activeRoom.estado === 'finalizada';

    const winnerParticipant = activeRoom.id_ganador
      ? activeRoom.participantes.find((p) => p.id_usuario === activeRoom.id_ganador)
      : null;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBackToLobby}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#1e40af] hover:text-[#1e3a8a] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a competencias</span>
          </button>

          <div className="flex items-center gap-4 text-xs text-[#444653] tabular-nums">
            <span>
              Sala <strong className="font-mono text-[#191c1e]">{activeRoom.codigo}</strong>
            </span>
            <span>·</span>
            <span>{activeRoom.saber_titulo}</span>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="bg-[#fff1f2] border border-[#fecdd3] text-[#ba1a1a] text-sm rounded-xl px-4 py-3"
          >
            {errorMsg}
          </div>
        )}

        {wsNotice && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>{wsNotice}</span>
          </div>
        )}

        {/* ESTADO: ESPERANDO AL SEGUNDO JUGADOR */}
        {isWaiting && (
          <section className="bg-white border border-slate-200 rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-6">
            <div className="w-12 h-12 rounded-xl bg-[#eef2ff] text-[#4f46e5] flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold text-[#191c1e]">
                Esperando al segundo participante
              </h1>
              <p className="text-sm text-[#444653]">
                Comparte este código con otro usuario de A.B.A. para competir en{' '}
                <strong className="text-[#191c1e]">{activeRoom.saber_titulo}</strong> (
                {activeRoom.preguntas.length} preguntas).
              </p>
            </div>

            <div className="bg-[#f7f9fb] border border-slate-200 rounded-xl p-5 inline-flex items-center gap-4">
              <span className="font-mono text-3xl font-bold tracking-[0.22em] text-[#1e40af] tabular-nums">
                {activeRoom.codigo}
              </span>
              <button
                type="button"
                onClick={() => handleCopyCode(activeRoom.codigo)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#191c1e] transition"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-[#006c49]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>

            <p className="text-xs text-[#444653]">
              La competencia iniciará automáticamente en cuanto tu oponente ingrese el código.
            </p>
          </section>
        )}

        {/* ESTADO: EN CURSO */}
        {isPlaying && me && (
          <div className="space-y-6">
            {/* Barra de progreso comparativa en tiempo real */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-[#444653]">
                  <span className="font-semibold text-[#1e40af]">{me.nombre_usuario} (Tú)</span>
                  <span className="tabular-nums font-semibold text-[#191c1e]">
                    {me.respondidas}/{me.total_preguntas}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4f46e5] transition-all"
                    style={{
                      width: `${Math.round((me.respondidas / Math.max(1, me.total_preguntas)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-[#444653] tabular-nums">
                  Aciertos actuales: <strong className="text-[#191c1e]">{me.aciertos}</strong>
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[#444653]">
                  Tiempo transcurrido
                </span>
                <div className="flex items-center gap-1.5 mt-1 font-display text-2xl font-bold text-[#191c1e] tabular-nums">
                  <Clock className="w-5 h-5 text-[#4f46e5]" />
                  <span>{formatClock(elapsedMs)}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-[#444653]">
                  <span className="font-semibold text-[#191c1e]">
                    {opponent ? opponent.nombre_usuario : 'Oponente'}
                  </span>
                  <span className="tabular-nums font-semibold text-[#191c1e]">
                    {opponent ? `${opponent.respondidas}/${opponent.total_preguntas}` : '0/0'}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#006c49] transition-all"
                    style={{
                      width: opponent
                        ? `${Math.round((opponent.respondidas / Math.max(1, opponent.total_preguntas)) * 100)}%`
                        : '0%',
                    }}
                  />
                </div>
                <p className="text-xs text-[#444653]">
                  {opponent?.estado === 'finalizado'
                    ? 'Oponente finalizó todas las preguntas'
                    : opponent?.en_linea
                      ? 'Conectado en tiempo real'
                      : 'Reconectando...'}
                </p>
              </div>
            </div>

            {/* Pregunta actual o espera al oponente */}
            {currentQuestion ? (
              <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#4f46e5] tabular-nums">
                    Pregunta {currentQuestion.orden} de {activeRoom.preguntas.length}
                  </span>
                  <span className="text-xs text-[#444653]">
                    Al seleccionar una opción se guarda tu respuesta
                  </span>
                </div>

                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#191c1e]">
                  {currentQuestion.enunciado_pregunta}
                </h2>

                <div className="space-y-3">
                  {(['A', 'B', 'C'] as const).map((letra) => {
                    const texto =
                      letra === 'A'
                        ? currentQuestion.opcion_a
                        : letra === 'B'
                          ? currentQuestion.opcion_b
                          : currentQuestion.opcion_c;
                    return (
                      <button
                        key={letra}
                        type="button"
                        disabled={submittingAnswer}
                        onClick={() => handleSubmitAnswer(currentQuestion.id_respuesta, letra)}
                        className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-[#4f46e5] hover:bg-[#eef2ff]/60 disabled:opacity-60 transition flex items-start gap-3"
                      >
                        <span className="w-7 h-7 rounded-lg bg-[#eef2ff] text-[#1e40af] font-bold text-sm flex items-center justify-center shrink-0">
                          {letra}
                        </span>
                        <span className="text-sm sm:text-base font-medium text-[#191c1e] pt-0.5">
                          {texto}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-[#006c49] mx-auto" />
                <h2 className="font-display text-xl font-bold text-[#191c1e]">
                  ¡Has respondido todas las preguntas!
                </h2>
                <p className="text-sm text-[#444653] tabular-nums">
                  Tu tiempo registrado: <strong>{formatDurationMs(me.tiempo_ms)}</strong>. Esperando a que{' '}
                  <strong>{opponent?.nombre_usuario ?? 'tu oponente'}</strong> termine para mostrar la
                  comparación final.
                </p>
              </section>
            )}
          </div>
        )}

        {/* ESTADO: FINALIZADA — COMPARACIÓN DE RESULTADOS */}
        {isFinished && (
          <div className="space-y-6">
            {/* Banner de ganador / cierre */}
            <section
              className={`rounded-2xl border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                activeRoom.id_ganador === user.id_usuario
                  ? 'bg-[#eefcf6] border-[#a7f3d0]'
                  : activeRoom.id_ganador === null
                    ? 'bg-[#eef2ff] border-[#c7d2fe]'
                    : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 text-[#4f46e5]">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#444653]">
                    {activeRoom.motivo_cierre === 'desconexion'
                      ? 'Competencia finalizada por desconexión'
                      : 'Competencia completada'}
                  </p>
                  <h1 className="font-display text-2xl font-bold text-[#191c1e] mt-0.5">
                    {activeRoom.id_ganador === null
                      ? 'Empate técnico'
                      : activeRoom.id_ganador === user.id_usuario
                        ? '¡Ganaste la competencia!'
                        : `Ganador: ${winnerParticipant?.nombre_usuario ?? 'Oponente'}`}
                  </h1>
                  <p className="text-xs text-[#444653] mt-1">
                    {activeRoom.saber_titulo} · {activeRoom.nombre_grado}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBackToLobby}
                className="px-4 py-2.5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold whitespace-nowrap transition"
              >
                Nueva competencia
              </button>
            </section>

            {/* Tarjetas comparativas de los dos participantes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeRoom.participantes.map((p) => {
                const esGanador = activeRoom.id_ganador === p.id_usuario;
                return (
                  <div
                    key={p.id_usuario}
                    className={`bg-white rounded-2xl border p-6 space-y-4 ${
                      esGanador ? 'border-[#006c49]' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="font-display text-lg font-bold text-[#191c1e]">
                          {p.nombre_usuario}{' '}
                          {p.es_usuario_actual && (
                            <span className="text-xs font-medium text-[#4f46e5]">(Tú)</span>
                          )}
                        </h2>
                        <p className="text-xs text-[#444653]">
                          {p.estado === 'desconectado'
                            ? 'Desconectado antes de finalizar'
                            : esGanador
                              ? 'Primer lugar'
                              : activeRoom.id_ganador === null
                                ? 'Empate'
                                : 'Segundo lugar'}
                        </p>
                      </div>
                      <span className="font-display text-3xl font-bold text-[#1e40af] tabular-nums">
                        {p.puntuacion.toFixed(2)}
                        <span className="text-sm font-normal text-[#444653]"> / 5.00</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                      <div>
                        <p className="text-xs text-[#444653]">Aciertos</p>
                        <p className="text-base font-bold text-[#191c1e] tabular-nums">
                          {p.aciertos} / {p.total_preguntas}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#444653]">Tiempo empleado</p>
                        <p className="text-base font-bold text-[#191c1e] tabular-nums">
                          {formatDurationMs(p.tiempo_ms)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desglose pregunta por pregunta */}
            {activeRoom.comparacion && (
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h2 className="font-display text-lg font-bold text-[#191c1e]">
                    Comparación por pregunta
                  </h2>
                  <p className="text-xs text-[#444653]">
                    Revisa las respuestas elegidas por ambos participantes y la explicación correcta.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f7f9fb] text-xs uppercase text-[#444653] border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 font-semibold">#</th>
                        <th className="px-6 py-3 font-semibold">Pregunta</th>
                        <th className="px-6 py-3 font-semibold">Correcta</th>
                        {activeRoom.participantes.map((p) => (
                          <th key={p.id_usuario} className="px-6 py-3 font-semibold">
                            {p.nombre_usuario}
                            {p.es_usuario_actual ? ' (Tú)' : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeRoom.comparacion.map((item) => (
                        <tr key={item.id_respuesta} className="align-top">
                          <td className="px-6 py-4 font-semibold text-[#444653] tabular-nums">
                            {item.orden}
                          </td>
                          <td className="px-6 py-4 space-y-1 max-w-md">
                            <p className="font-medium text-[#191c1e]">{item.enunciado_pregunta}</p>
                            {item.explicacion && (
                              <p className="text-xs text-[#444653]">{item.explicacion}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 font-bold text-[#006c49]">
                            {item.opcion_correcta}
                          </td>
                          {activeRoom.participantes.map((p) => {
                            const resp = item.respuestas_por_usuario[p.id_usuario];
                            if (!resp) {
                              return (
                                <td key={p.id_usuario} className="px-6 py-4 text-xs text-[#444653]">
                                  Sin responder
                                </td>
                              );
                            }
                            return (
                              <td key={p.id_usuario} className="px-6 py-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                                    resp.es_correcta ? 'text-[#006c49]' : 'text-[#ba1a1a]'
                                  }`}
                                >
                                  {resp.es_correcta ? (
                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                  ) : (
                                    <XCircle className="w-4 h-4 shrink-0" />
                                  )}
                                  <span>Opción {resp.opcion_elegida}</span>
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- VISTA: LOBBY DE COMPETENCIAS E HISTORIAL ---
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[#4f46e5] text-xs font-semibold uppercase tracking-wider">
          <Swords className="w-4 h-4" />
          <span>Competencias en tiempo real · 1 vs 1</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-[#191c1e]">
          Duelos por Saber
        </h1>
        <p className="text-sm text-[#444653] max-w-2xl">
          Compite en línea contra otro usuario con exactamente las mismas preguntas de un saber y
          compara al instante tu puntuación, tiempo empleado y aciertos por pregunta.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="bg-[#fff1f2] border border-[#fecdd3] text-[#ba1a1a] text-sm rounded-xl px-4 py-3"
        >
          {errorMsg}
        </div>
      )}

      {/* Crear sala o unirse mediante código */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-[#191c1e]">
              Crear sala de competencia
            </h2>
            <p className="text-xs text-[#444653]">
              Elige un saber y genera un código de 6 caracteres para invitar a tu oponente.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="duelo-saber-select" className="block text-xs font-semibold text-[#191c1e]">
              Saber o tema
            </label>
            <select
              id="duelo-saber-select"
              value={selectedSaberId}
              onChange={(e) => setSelectedSaberId(Number(e.target.value))}
              disabled={loadingLobby || saberes.length === 0}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
            >
              {saberes.length === 0 ? (
                <option value={0}>Cargando saberes...</option>
              ) : (
                saberes.map((s) => (
                  <option key={s.id_saber} value={s.id_saber}>
                    {s.titulo} ({s.nombre_grado})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            disabled={busyAction || selectedSaberId <= 0}
            onClick={handleCreateRoom}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-50 text-white text-sm font-semibold transition"
          >
            <Plus className="w-4 h-4" />
            <span>Crear sala</span>
          </button>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-[#191c1e]">
              Unirse con un código
            </h2>
            <p className="text-xs text-[#444653]">
              Ingresa el código compartido por el creador de la sala para comenzar el duelo.
            </p>
          </div>

          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="duelo-codigo-input" className="block text-xs font-semibold text-[#191c1e]">
                Código de sala
              </label>
              <input
                id="duelo-codigo-input"
                type="text"
                maxLength={10}
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Ej. A7K9P2"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white font-mono uppercase tracking-widest text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
              />
            </div>

            <button
              type="submit"
              disabled={busyAction || !joinCodeInput.trim()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#1e40af] hover:bg-[#1e3a8a] disabled:opacity-50 text-white text-sm font-semibold transition"
            >
              <LogIn className="w-4 h-4" />
              <span>Unirse a sala</span>
            </button>
          </form>
        </section>
      </div>

      {/* Historial de competencias para consulta posterior */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <History className="w-4 h-4 text-[#4f46e5]" />
          <h2 className="font-display text-lg font-bold text-[#191c1e]">
            Historial de competencias
          </h2>
        </div>

        {loadingLobby ? (
          <div className="p-6 text-sm text-[#444653]">Cargando historial...</div>
        ) : history.length === 0 ? (
          <div className="p-6 text-sm text-[#444653]">
            Aún no has participado en ninguna competencia en línea. Crea o únete a una sala para comenzar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f7f9fb] text-xs uppercase text-[#444653] border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold">Sala</th>
                  <th className="px-6 py-3 font-semibold">Saber</th>
                  <th className="px-6 py-3 font-semibold">Oponente</th>
                  <th className="px-6 py-3 font-semibold">Tu resultado</th>
                  <th className="px-6 py-3 font-semibold">Oponente</th>
                  <th className="px-6 py-3 font-semibold">Estado</th>
                  <th className="px-6 py-3 font-semibold text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => {
                  const gano = item.id_ganador === user.id_usuario;
                  const empate = item.estado === 'finalizada' && item.id_ganador === null;
                  return (
                    <tr key={item.id_sala} className="hover:bg-slate-50/70">
                      <td className="px-6 py-3.5 font-mono font-semibold text-[#1e40af]">
                        {item.codigo}
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-[#191c1e]">{item.saber_titulo}</p>
                        <p className="text-xs text-[#444653]">{formatFecha(item.creada_en)}</p>
                      </td>
                      <td className="px-6 py-3.5 text-[#191c1e]">
                        {item.oponente_nombre ?? 'Esperando oponente'}
                      </td>
                      <td className="px-6 py-3.5 tabular-nums">
                        <span className="font-semibold text-[#191c1e]">
                          {item.mi_puntuacion.toFixed(2)}
                        </span>{' '}
                        <span className="text-xs text-[#444653]">
                          ({item.mi_aciertos}/{item.total_preguntas} · {formatDurationMs(item.mi_tiempo_ms)})
                        </span>
                      </td>
                      <td className="px-6 py-3.5 tabular-nums">
                        {item.oponente_puntuacion !== null ? (
                          <>
                            <span className="font-semibold text-[#191c1e]">
                              {item.oponente_puntuacion.toFixed(2)}
                            </span>{' '}
                            <span className="text-xs text-[#444653]">
                              ({item.oponente_aciertos}/{item.total_preguntas} ·{' '}
                              {formatDurationMs(item.oponente_tiempo_ms)})
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-[#444653]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-xs font-semibold">
                        {item.estado === 'esperando' && (
                          <span className="text-[#4f46e5]">En espera</span>
                        )}
                        {item.estado === 'en_curso' && (
                          <span className="text-amber-700">En curso</span>
                        )}
                        {item.estado === 'finalizada' && (
                          <span
                            className={
                              gano
                                ? 'text-[#006c49]'
                                : empate
                                  ? 'text-[#1e40af]'
                                  : 'text-[#444653]'
                            }
                          >
                            {gano ? 'Victoria' : empate ? 'Empate' : 'Finalizada'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenRoomFromHistory(item.codigo)}
                          className="text-xs font-semibold text-[#4f46e5] hover:underline"
                        >
                          {item.estado === 'finalizada' ? 'Ver comparación' : 'Reingresar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
