import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  LogOut,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  Users,
  Video,
  VideoOff,
  XCircle,
} from 'lucide-react';
import { apiFetch, getSessionToken } from '../lib/api';
import type { AuthUser, SaberItem } from '../types';

interface VirtualRoomParticipant {
  peer_id: string;
  id_usuario: number;
  nombre_usuario: string;
  nombre_rol: string;
  es_anfitrion: boolean;
  mic_enabled: boolean;
  cam_enabled: boolean;
  conectado_en_ms: number;
}

interface VirtualRoomMessage {
  id_mensaje: number;
  id_usuario: number;
  nombre_usuario: string;
  nombre_rol: string;
  contenido: string;
  enviado_en_ms: number;
}

interface VirtualRoomSummary {
  id_sala_virtual: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  id_saber: number | null;
  saber_titulo: string | null;
  id_creador: number;
  creador_nombre: string;
  estado: 'activa' | 'cerrada';
  creada_en: string;
  participantes_conectados: number;
}

interface VirtualRoomDetail extends VirtualRoomSummary {
  participantes: VirtualRoomParticipant[];
  mensajes: VirtualRoomMessage[];
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

interface RemoteVideoTileProps {
  participant: VirtualRoomParticipant;
  stream: MediaStream | undefined;
}

const RemoteVideoTile: React.FC<RemoteVideoTileProps> = ({ participant, stream }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
    } else if (!stream) {
      el.srcObject = null;
    }
  }, [stream]);

  const hasLiveVideo =
    Boolean(stream) &&
    stream!.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled) &&
    participant.cam_enabled;

  return (
    <div className="bg-[#0f172a] rounded-xl overflow-hidden border border-slate-800 relative aspect-video flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${hasLiveVideo ? 'block' : 'hidden'}`}
      />
      {!hasLiveVideo && (
        <div className="text-center px-4">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-white font-display font-bold text-lg flex items-center justify-center mx-auto">
            {participant.nombre_usuario.charAt(0).toUpperCase()}
          </div>
          <p className="mt-2 text-xs text-slate-300 font-medium">
            {participant.cam_enabled ? 'Conectando cámara...' : 'Cámara desactivada'}
          </p>
        </div>
      )}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-slate-950/75 text-white text-xs">
        <span className="truncate font-medium">
          {participant.nombre_usuario}
          {participant.es_anfitrion ? ' · Anfitrión' : ''}
        </span>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          {participant.mic_enabled ? (
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <MicOff className="w-3.5 h-3.5 text-slate-400" />
          )}
          {participant.cam_enabled ? (
            <Video className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <VideoOff className="w-3.5 h-3.5 text-slate-400" />
          )}
        </span>
      </div>
    </div>
  );
};

interface SalasViewProps {
  user: AuthUser;
  initialRoomCode?: string | null;
  onClearInitialRoomCode?: () => void;
}

export const SalasView: React.FC<SalasViewProps> = ({
  user,
  initialRoomCode = null,
  onClearInitialRoomCode,
}) => {
  // Lobby state
  const [saberes, setSaberes] = useState<SaberItem[]>([]);
  const [activeRooms, setActiveRooms] = useState<VirtualRoomSummary[]>([]);
  const [loadingLobby, setLoadingLobby] = useState(true);

  const [roomName, setRoomName] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [selectedSaberId, setSelectedSaberId] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState(initialRoomCode ?? '');
  const [creating, setCreating] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // Active room state
  const [currentRoom, setCurrentRoom] = useState<VirtualRoomDetail | null>(null);
  const [participants, setParticipants] = useState<VirtualRoomParticipant[]>([]);
  const [messages, setMessages] = useState<VirtualRoomMessage[]>([]);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>(
    'disconnected'
  );
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Media / WebRTC state
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  // Refs for cleanup and WebRTC callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const myPeerIdRef = useRef<string | null>(null);
  const intentionalLeaveRef = useRef<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadLobby = useCallback(async () => {
    setLoadingLobby(true);
    try {
      const [salasRes, saberesRes] = await Promise.all([
        apiFetch('/api/salas'),
        apiFetch('/api/saberes'),
      ]);
      const salasData = await salasRes.json();
      const saberesData = await saberesRes.json();
      if (salasRes.ok) setActiveRooms(salasData.salas || []);
      if (saberesRes.ok) setSaberes(saberesData.saberes || []);
    } catch {
      // Silencioso en carga inicial
    } finally {
      setLoadingLobby(false);
    }
  }, []);

  useEffect(() => {
    void loadLobby();
  }, [loadLobby]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const stopAllMediaAndPeers = useCallback(() => {
    for (const [peerId, pc] of peersRef.current.entries()) {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // Ignorar
      }
      peersRef.current.delete(peerId);
    }
    pendingIceRef.current.clear();
    setRemoteStreams({});

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignorar
        }
      }
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    setMicEnabled(false);
    setCamEnabled(false);
  }, []);

  const closeWebSocketCleanly = useCallback((sendLeave: boolean) => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (!ws) return;
    if (sendLeave && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'room:leave' }));
      } catch {
        // Ignorar
      }
    }
    try {
      ws.close(1000, 'Cierre de conexión');
    } catch {
      // Ignorar
    }
  }, []);

  const sendSignal = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const createOrGetPeerConnection = useCallback(
    (remotePeerId: string): RTCPeerConnection => {
      const existing = peersRef.current.get(remotePeerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_CONFIG);

      // Adjuntar pistas locales si el usuario ya habilitó micrófono o cámara
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            type: 'rtc:ice-candidate',
            target_peer_id: remotePeerId,
            payload: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        setRemoteStreams((prev) => ({
          ...prev,
          [remotePeerId]: stream,
        }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setRemoteStreams((prev) => {
            if (!prev[remotePeerId]) return prev;
            const copy = { ...prev };
            delete copy[remotePeerId];
            return copy;
          });
        }
      };

      peersRef.current.set(remotePeerId, pc);
      return pc;
    },
    [sendSignal]
  );

  const flushPendingIce = useCallback(async (remotePeerId: string, pc: RTCPeerConnection) => {
    const queue = pendingIceRef.current.get(remotePeerId);
    if (!queue || queue.length === 0) return;
    pendingIceRef.current.delete(remotePeerId);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignorar candidato incompatible
      }
    }
  }, []);

  const initiateOfferToPeer = useCallback(
    async (remotePeerId: string) => {
      try {
        const pc = createOrGetPeerConnection(remotePeerId);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        sendSignal({
          type: 'rtc:offer',
          target_peer_id: remotePeerId,
          payload: pc.localDescription,
        });
      } catch {
        // Ignorar fallos transitorios de negociación
      }
    },
    [createOrGetPeerConnection, sendSignal]
  );

  const syncWebRtcMeshWithParticipants = useCallback(
    (list: VirtualRoomParticipant[], selfPeerId: string) => {
      const activeIds = new Set(list.map((p) => p.peer_id));

      // Cerrar conexiones de participantes que salieron
      for (const [peerId, pc] of peersRef.current.entries()) {
        if (!activeIds.has(peerId)) {
          pc.close();
          peersRef.current.delete(peerId);
          pendingIceRef.current.delete(peerId);
          setRemoteStreams((prev) => {
            if (!prev[peerId]) return prev;
            const copy = { ...prev };
            delete copy[peerId];
            return copy;
          });
        }
      }

      // Desempate determinista para evitar colisión de ofertas simultáneas
      for (const p of list) {
        if (p.peer_id === selfPeerId) continue;
        if (!peersRef.current.has(p.peer_id) && selfPeerId < p.peer_id) {
          void initiateOfferToPeer(p.peer_id);
        }
      }
    },
    [initiateOfferToPeer]
  );

  const connectToRoomSocket = useCallback(
    (codigo: string) => {
      closeWebSocketCleanly(false);
      intentionalLeaveRef.current = false;
      setWsStatus('connecting');
      setRoomNotice(null);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getSessionToken();
      const qs = new URLSearchParams({ codigo });
      if (token) qs.set('token', token);

      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/salas?${qs.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type?: string;
            your_peer_id?: string;
            room?: VirtualRoomDetail;
            participantes?: VirtualRoomParticipant[];
            message?: VirtualRoomMessage | string;
            error?: string;
            peer_id?: string;
            from_peer_id?: string;
            payload?: unknown;
          };

          if (data.type === 'room:state' && data.room) {
            const selfId = data.your_peer_id || null;
            myPeerIdRef.current = selfId;
            setMyPeerId(selfId);
            setCurrentRoom(data.room);
            setParticipants(data.room.participantes);
            setMessages(data.room.mensajes);
            if (selfId) {
              syncWebRtcMeshWithParticipants(data.room.participantes, selfId);
            }
            return;
          }

          if (data.type === 'room:participants' && Array.isArray(data.participantes)) {
            setParticipants(data.participantes);
            if (myPeerIdRef.current) {
              syncWebRtcMeshWithParticipants(data.participantes, myPeerIdRef.current);
            }
            return;
          }

          if (data.type === 'chat:message' && data.message && typeof data.message === 'object') {
            const incoming = data.message as VirtualRoomMessage;
            setMessages((prev) =>
              prev.some((m) => m.id_mensaje === incoming.id_mensaje)
                ? prev
                : [...prev, incoming]
            );
            return;
          }

          if (data.type === 'rtc:peer-left' && data.peer_id) {
            const pc = peersRef.current.get(data.peer_id);
            if (pc) {
              pc.close();
              peersRef.current.delete(data.peer_id);
            }
            pendingIceRef.current.delete(data.peer_id);
            setRemoteStreams((prev) => {
              if (!prev[data.peer_id!]) return prev;
              const copy = { ...prev };
              delete copy[data.peer_id!];
              return copy;
            });
            return;
          }

          if (data.type === 'rtc:offer' && data.from_peer_id && data.payload) {
            const pc = createOrGetPeerConnection(data.from_peer_id);
            await pc.setRemoteDescription(
              new RTCSessionDescription(data.payload as RTCSessionDescriptionInit)
            );
            await flushPendingIce(data.from_peer_id, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({
              type: 'rtc:answer',
              target_peer_id: data.from_peer_id,
              payload: pc.localDescription,
            });
            return;
          }

          if (data.type === 'rtc:answer' && data.from_peer_id && data.payload) {
            const pc = peersRef.current.get(data.from_peer_id);
            if (pc) {
              await pc.setRemoteDescription(
                new RTCSessionDescription(data.payload as RTCSessionDescriptionInit)
              );
              await flushPendingIce(data.from_peer_id, pc);
            }
            return;
          }

          if (data.type === 'rtc:ice-candidate' && data.from_peer_id && data.payload) {
            const pc = createOrGetPeerConnection(data.from_peer_id);
            const cand = data.payload as RTCIceCandidateInit;
            if (pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {
                // Ignorar
              }
            } else {
              const queue = pendingIceRef.current.get(data.from_peer_id) ?? [];
              queue.push(cand);
              pendingIceRef.current.set(data.from_peer_id, queue);
            }
            return;
          }

          if (data.type === 'room:closed') {
            intentionalLeaveRef.current = true;
            setRoomNotice(
              typeof data.message === 'string'
                ? data.message
                : 'La sala fue cerrada por el anfitrión.'
            );
            stopAllMediaAndPeers();
            closeWebSocketCleanly(false);
            setCurrentRoom(null);
            setParticipants([]);
            setMessages([]);
            void loadLobby();
            return;
          }

          if (data.type === 'room:error' && data.error) {
            setRoomNotice(data.error);
          }
        } catch {
          // Ignorar mensaje malformado
        }
      };

      ws.onerror = () => {
        if (!intentionalLeaveRef.current) {
          setWsStatus('error');
        }
      };

      ws.onclose = () => {
        if (!intentionalLeaveRef.current) {
          setWsStatus('disconnected');
        }
      };
    },
    [
      closeWebSocketCleanly,
      createOrGetPeerConnection,
      flushPendingIce,
      loadLobby,
      sendSignal,
      stopAllMediaAndPeers,
      syncWebRtcMeshWithParticipants,
    ]
  );

  // Limpieza garantizada al desmontar la vista
  useEffect(() => {
    return () => {
      intentionalLeaveRef.current = true;
      stopAllMediaAndPeers();
      closeWebSocketCleanly(true);
    };
  }, [closeWebSocketCleanly, stopAllMediaAndPeers]);

  const enterRoomByCode = useCallback(
    async (rawCode: string) => {
      const codigo = rawCode.trim().toUpperCase();
      if (!codigo) {
        setLobbyError('Ingresa el código o enlace de la sala para unirte.');
        return;
      }
      setLobbyError(null);
      try {
        const res = await apiFetch(`/api/salas/${encodeURIComponent(codigo)}`);
        const data = await res.json();
        if (!res.ok) {
          setLobbyError(data.error || 'No se encontró la sala virtual.');
          return;
        }
        if (data.room.estado !== 'activa') {
          setLobbyError('Esta sala virtual ya fue cerrada.');
          return;
        }
        setCurrentRoom(data.room as VirtualRoomDetail);
        setParticipants(data.room.participantes || []);
        setMessages(data.room.mensajes || []);
        connectToRoomSocket(codigo);
      } catch {
        setLobbyError('Error de red al intentar conectar con la sala.');
      }
    },
    [connectToRoomSocket]
  );

  // Unión automática si llega desde un enlace compartido (?sala=CODIGO)
  useEffect(() => {
    if (initialRoomCode && !currentRoom) {
      const code = initialRoomCode;
      onClearInitialRoomCode?.();
      void enterRoomByCode(code);
    }
  }, [initialRoomCode, currentRoom, enterRoomByCode, onClearInitialRoomCode]);

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    setLobbyError(null);
    if (roomName.trim().length < 3) {
      setLobbyError('El nombre de la sala debe tener al menos 3 caracteres.');
      return;
    }

    setCreating(true);
    try {
      const res = await apiFetch('/api/salas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: roomName.trim(),
          descripcion: roomDesc.trim() || null,
          id_saber: selectedSaberId ? Number(selectedSaberId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLobbyError(data.error || 'No se pudo crear la sala virtual.');
        return;
      }
      setRoomName('');
      setRoomDesc('');
      setSelectedSaberId('');
      const created = data.room as VirtualRoomDetail;
      setCurrentRoom(created);
      setParticipants(created.participantes || []);
      setMessages(created.mensajes || []);
      connectToRoomSocket(created.codigo);
      void loadLobby();
    } catch {
      setLobbyError('No fue posible crear la sala. Verifica tu conexión.');
    } finally {
      setCreating(false);
    }
  }

  function handleLeaveRoom() {
    intentionalLeaveRef.current = true;
    stopAllMediaAndPeers();
    closeWebSocketCleanly(true);
    setCurrentRoom(null);
    setParticipants([]);
    setMessages([]);
    setMyPeerId(null);
    myPeerIdRef.current = null;
    setWsStatus('disconnected');
    void loadLobby();
  }

  async function handleCloseRoomForAll() {
    if (!currentRoom) return;
    try {
      const res = await apiFetch(`/api/salas/${encodeURIComponent(currentRoom.codigo)}/cerrar`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json();
        setRoomNotice(d.error || 'No tienes permiso para cerrar esta sala.');
        return;
      }
      intentionalLeaveRef.current = true;
      stopAllMediaAndPeers();
      closeWebSocketCleanly(false);
      setCurrentRoom(null);
      setParticipants([]);
      setMessages([]);
      setRoomNotice('La sala virtual se cerró correctamente para todos los participantes.');
      void loadLobby();
    } catch {
      setRoomNotice('Error de red al cerrar la sala.');
    }
  }

  async function toggleMedia(kind: 'audio' | 'video') {
    setMediaError(null);
    const nextMic = kind === 'audio' ? !micEnabled : micEnabled;
    const nextCam = kind === 'video' ? !camEnabled : camEnabled;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMediaError('Tu navegador no admite acceso a cámara o micrófono en este contexto.');
      return;
    }

    try {
      let stream = localStreamRef.current;

      if (!nextMic && !nextCam) {
        if (stream) {
          for (const t of stream.getTracks()) t.stop();
          localStreamRef.current = null;
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      } else {
        const needsAudio = nextMic && (!stream || stream.getAudioTracks().length === 0);
        const needsVideo = nextCam && (!stream || stream.getVideoTracks().length === 0);

        if (needsAudio || needsVideo) {
          const acquired = await navigator.mediaDevices.getUserMedia({
            audio: nextMic,
            video: nextCam,
          });
          if (stream) {
            for (const t of stream.getTracks()) t.stop();
          }
          stream = acquired;
          localStreamRef.current = stream;

          // Actualizar pistas en todas las conexiones RTCPeerConnection abiertas y renegociar
          for (const [peerId, pc] of peersRef.current.entries()) {
            const senders = pc.getSenders();
            for (const track of stream.getTracks()) {
              const existingSender = senders.find((s) => s.track?.kind === track.kind);
              if (existingSender) {
                await existingSender.replaceTrack(track);
              } else {
                pc.addTrack(track, stream);
              }
            }
            void initiateOfferToPeer(peerId);
          }
        }

        if (stream) {
          for (const t of stream.getAudioTracks()) t.enabled = nextMic;
          for (const t of stream.getVideoTracks()) t.enabled = nextCam;
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream ?? null;
        }
      }

      setMicEnabled(nextMic);
      setCamEnabled(nextCam);
      sendSignal({
        type: 'media:state',
        mic_enabled: nextMic,
        cam_enabled: nextCam,
      });
    } catch {
      setMediaError(
        'No se otorgó permiso para micrófono o cámara. Puedes seguir participando mediante el chat en vivo.'
      );
    }
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    if (wsStatus !== 'connected') {
      setRoomNotice('No hay conexión activa en este momento. Intenta reconectar.');
      return;
    }
    sendSignal({ type: 'chat:send', contenido: text });
    setChatInput('');
  }

  async function copyInviteLink() {
    if (!currentRoom) return;
    const url = `${window.location.origin}/?sala=${encodeURIComponent(currentRoom.codigo)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setRoomNotice(`Comparte este código de acceso: ${currentRoom.codigo}`);
    }
  }

  // --- VISTA DENTRO DE UNA SALA ---
  if (currentRoom) {
    const canCloseRoom =
      currentRoom.id_creador === user.id_usuario || user.nombre_rol === 'Administrador';
    const remoteParticipants = participants.filter((p) => p.peer_id !== myPeerId);

    return (
      <div className="space-y-6">
        {/* Cabecera de sala */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 card-elevation flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono-num font-bold text-[#4f46e5]">
                Código: {currentRoom.codigo}
              </span>
              {currentRoom.saber_titulo && (
                <span className="text-[#444653]">· Saber: {currentRoom.saber_titulo}</span>
              )}
              <span
                className={`font-semibold ${
                  wsStatus === 'connected'
                    ? 'text-[#047857]'
                    : wsStatus === 'connecting'
                      ? 'text-amber-700'
                      : 'text-[#ba1a1a]'
                }`}
              >
                ·{' '}
                {wsStatus === 'connected'
                  ? 'En directo'
                  : wsStatus === 'connecting'
                    ? 'Conectando...'
                    : 'Desconectado'}
              </span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold text-[#191c1e]">
              {currentRoom.nombre}
            </h1>
            {currentRoom.descripcion && (
              <p className="mt-0.5 text-xs text-[#444653]">{currentRoom.descripcion}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void copyInviteLink()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#191c1e] transition"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-[#047857]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Enlace copiado' : 'Copiar invitación'}</span>
            </button>

            {wsStatus !== 'connected' && (
              <button
                type="button"
                onClick={() => connectToRoomSocket(currentRoom.codigo)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#1e40af] transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reconectar</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-[#191c1e] transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Salir de la sala</span>
            </button>

            {canCloseRoom && (
              <button
                type="button"
                onClick={() => void handleCloseRoomForAll()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#ba1a1a] hover:bg-red-800 text-white text-xs font-semibold transition"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cerrar sala</span>
              </button>
            )}
          </div>
        </section>

        {(roomNotice || mediaError) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900">
            {roomNotice || mediaError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* Escenario de Audio / Video WebRTC */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Mi cámara / audio local */}
              <div className="bg-[#0f172a] rounded-xl overflow-hidden border border-slate-800 relative aspect-video flex items-center justify-center">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${camEnabled ? 'block' : 'hidden'}`}
                />
                {!camEnabled && (
                  <div className="text-center px-4">
                    <div className="w-12 h-12 rounded-full bg-[#4f46e5] text-white font-display font-bold text-lg flex items-center justify-center mx-auto">
                      {user.nombre.charAt(0).toUpperCase()}
                    </div>
                    <p className="mt-2 text-xs text-slate-300">Tu cámara está desactivada</p>
                  </div>
                )}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-slate-950/75 text-white text-xs">
                  <span className="truncate font-medium">
                    {user.nombre} {user.apellido} (Tú)
                  </span>
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    {micEnabled ? (
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <MicOff className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    {camEnabled ? (
                      <Video className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <VideoOff className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </span>
                </div>
              </div>

              {/* Participantes remotos */}
              {remoteParticipants.map((p) => (
                <RemoteVideoTile
                  key={p.peer_id}
                  participant={p}
                  stream={remoteStreams[p.peer_id]}
                />
              ))}
            </div>

            {/* Controles multimedia */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 card-elevation flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void toggleMedia('audio')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                    micEnabled
                      ? 'bg-[#047857] text-white hover:bg-emerald-800'
                      : 'bg-[#f2f4f6] text-[#191c1e] hover:bg-slate-200'
                  }`}
                >
                  {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  <span>{micEnabled ? 'Silenciar micrófono' : 'Activar micrófono'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void toggleMedia('video')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                    camEnabled
                      ? 'bg-[#4f46e5] text-white hover:bg-[#4338ca]'
                      : 'bg-[#f2f4f6] text-[#191c1e] hover:bg-slate-200'
                  }`}
                >
                  {camEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  <span>{camEnabled ? 'Apagar cámara' : 'Activar cámara'}</span>
                </button>
              </div>

              <span className="text-xs text-[#444653]">
                Audio y vídeo directo P2P (WebRTC) · Chat sincronizado en servidor
              </span>
            </div>
          </div>

          {/* Barra lateral: Participantes + Chat en tiempo real */}
          <div className="space-y-4">
            {/* Participantes */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#4f46e5]" />
                  <h2 className="font-display text-sm font-semibold text-[#191c1e]">
                    Participantes conectados
                  </h2>
                </div>
                <span className="text-xs font-mono-num font-semibold text-[#444653]">
                  {participants.length}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {participants.map((p) => (
                  <li
                    key={p.peer_id}
                    className="px-4 py-2.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#191c1e]">
                        {p.nombre_usuario}
                        {p.peer_id === myPeerId ? ' (Tú)' : ''}
                      </span>
                      <span className="block text-[#444653]">
                        {p.nombre_rol}
                        {p.es_anfitrion ? ' · Anfitrión' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500">
                      {p.mic_enabled ? (
                        <Mic className="w-3.5 h-3.5 text-[#047857]" />
                      ) : (
                        <MicOff className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      {p.cam_enabled ? (
                        <Video className="w-3.5 h-3.5 text-[#4f46e5]" />
                      ) : (
                        <VideoOff className="w-3.5 h-3.5 text-slate-300" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Chat en directo */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation flex flex-col h-[380px]">
              <div className="px-4 py-3 border-b border-slate-200">
                <h2 className="font-display text-sm font-semibold text-[#191c1e]">
                  Chat de puesta en común
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f7f9fb]">
                {messages.length === 0 ? (
                  <p className="text-xs text-[#444653] text-center py-6">
                    Aún no hay mensajes. Comparte tus ideas o presenta tu saber en el chat.
                  </p>
                ) : (
                  messages.map((m) => {
                    const isMine = m.id_usuario === user.id_usuario;
                    return (
                      <div
                        key={m.id_mensaje}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-[11px] text-[#444653] mb-0.5">
                          {isMine ? 'Tú' : m.nombre_usuario} ·{' '}
                          {new Date(m.enviado_en_ms).toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <div
                          className={`px-3 py-2 rounded-xl text-xs max-w-[85%] break-words ${
                            isMine
                              ? 'bg-[#4f46e5] text-white'
                              : 'bg-white border border-slate-200 text-[#191c1e]'
                          }`}
                        >
                          {m.contenido}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 flex gap-2 bg-white">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={1000}
                  placeholder="Escribe tu aporte o pregunta..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || wsStatus !== 'connected'}
                  aria-label="Enviar mensaje"
                  className="px-3 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-50 text-white transition"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // --- LOBBY DE SALAS VIRTUALES ---
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold text-[#4f46e5]">
          Comunicación y Aprendizaje Colaborativo en Vivo
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-[#191c1e]">
          Salas Virtuales de Saberes
        </h1>
        <p className="mt-1 text-sm text-[#444653] max-w-2xl">
          Crea una sala virtual para compartir y exponer saberes en directo, o únete mediante un código o enlace de invitación para conversar por chat, audio y vídeo.
        </p>
      </div>

      {(lobbyError || roomNotice) && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs ${
            lobbyError
              ? 'bg-red-50 border-red-200 text-[#ba1a1a]'
              : 'bg-indigo-50 border-indigo-200 text-[#1e40af]'
          }`}
        >
          {lobbyError || roomNotice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Crear sala */}
        <form
          onSubmit={handleCreateRoom}
          className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#4f46e5]" />
            <h2 className="font-display text-lg font-semibold text-[#191c1e]">
              Crear nueva sala virtual
            </h2>
          </div>

          <div>
            <label htmlFor="sala-nombre" className="block text-xs font-semibold text-[#444653] mb-1">
              Nombre de la sala *
            </label>
            <input
              id="sala-nombre"
              type="text"
              required
              minLength={3}
              maxLength={100}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Ej. Taller en vivo: Las Vocales y Conteo"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="sala-desc" className="block text-xs font-semibold text-[#444653] mb-1">
              Descripción (opcional)
            </label>
            <textarea
              id="sala-desc"
              rows={2}
              maxLength={400}
              value={roomDesc}
              onChange={(e) => setRoomDesc(e.target.value)}
              placeholder="Explica brevemente qué saberes van a compartir o practicar."
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="sala-saber" className="block text-xs font-semibold text-[#444653] mb-1">
              Saber relacionado (opcional)
            </label>
            <select
              id="sala-saber"
              value={selectedSaberId}
              onChange={(e) => setSelectedSaberId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
            >
              <option value="">Tema libre / Sin saber específico</option>
              {saberes.map((s) => (
                <option key={s.id_saber} value={s.id_saber}>
                  {s.titulo} ({s.nombre_grado})
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full py-2.5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-50 text-white text-sm font-semibold transition"
          >
            {creating ? 'Creando sala...' : 'Crear e ingresar a la sala'}
          </button>
        </form>

        {/* Unirse por código */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#191c1e]">
              Unirse mediante código de acceso
            </h2>
            <p className="text-xs text-[#444653]">
              Si un docente o compañero te compartió un código o enlace de sala virtual, escríbelo aquí para conectarte de inmediato.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enterRoomByCode(joinCodeInput);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Ej. A7K9P2"
                maxLength={12}
                className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono-num uppercase text-[#191c1e] focus:border-[#4f46e5] focus:outline-none"
              />
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-[#1e40af] hover:bg-blue-900 text-white text-sm font-semibold transition"
              >
                Entrar
              </button>
            </form>
          </div>

          <div className="bg-[#f7f9fb] border border-slate-200 rounded-xl p-4 text-xs text-[#444653]">
            Al ingresar podrás participar desde el chat de texto incluso sin micrófono o cámara, y activar audio o vídeo en vivo cuando lo necesites.
          </div>
        </div>
      </div>

      {/* Salas activas disponibles */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[#191c1e]">
            Salas Virtuales Activas
          </h2>
          <button
            type="button"
            onClick={() => void loadLobby()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4f46e5] hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </button>
        </div>

        {loadingLobby ? (
          <p className="p-6 text-sm text-[#444653]">Cargando salas activas...</p>
        ) : activeRooms.length === 0 ? (
          <p className="p-6 text-sm text-[#444653]">
            No hay salas virtuales abiertas en este momento. Crea una nueva para comenzar.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeRooms.map((rm) => (
              <div
                key={rm.id_sala_virtual}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#444653]">
                    <span className="font-mono-num font-bold text-[#4f46e5]">{rm.codigo}</span>
                    <span>· Anfitrión: {rm.creador_nombre}</span>
                    {rm.saber_titulo && <span>· Saber: {rm.saber_titulo}</span>}
                    <span>· {rm.participantes_conectados} conectado(s)</span>
                  </div>
                  <p className="mt-1 font-semibold text-sm text-[#191c1e]">{rm.nombre}</p>
                  {rm.descripcion && <p className="text-xs text-[#444653]">{rm.descripcion}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => void enterRoomByCode(rm.codigo)}
                  className="shrink-0 px-4 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold transition"
                >
                  Unirse a la sala
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
