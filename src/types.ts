export type RoleName = 'Administrador' | 'Profesor' | 'Estudiante';

export interface AuthUser {
  id_usuario: number;
  nombre: string;
  apellido: string;
  email: string;
  id_rol: number;
  nombre_rol: RoleName;
  id_estudiante: number | null;
  id_profesor: number | null;
  id_administrador: number | null;
  id_grado: number | null;
  nombre_grado: string | null;
  codigo_estudiantil: string | null;
  especialidad: string | null;
  nivel_acceso: string | null;
  puntos_saldo: number;
  fondo_activo: string | null;
  estilo_activo: string | null;
}

export interface Grado {
  id_grado: number;
  nombre_grado: string;
  seccion: string | null;
  total_saberes?: number;
  total_estudiantes?: number;
}

export interface VideoItem {
  id_video: number;
  titulo: string;
  url_video: string;
  duracion_segundos: number | null;
  id_saber: number;
  saber_titulo?: string;
  saber_descripcion?: string | null;
  id_grado?: number;
  nombre_grado?: string;
  seccion?: string | null;
  es_favorito?: boolean;
  favorito_creado_en?: string;
}

export interface PuntajeResumen {
  id_puntaje?: number;
  calificacion: number;
  fecha_realizacion: string;
}

export interface EvaluacionSummary {
  id_evaluacion: number;
  titulo: string;
  instrucciones: string | null;
  id_saber: number;
  total_preguntas?: number;
  ultimo_puntaje?: PuntajeResumen | null;
}

export interface SaberItem {
  id_saber: number;
  titulo: string;
  descripcion: string | null;
  id_grado: number;
  nombre_grado: string;
  seccion: string | null;
  videos: VideoItem[];
  evaluaciones: EvaluacionSummary[];
  preguntas_enunciados?: string[];
}

export interface PreguntaItem {
  id_respuesta: number;
  enunciado_pregunta: string;
  opcion_a: string;
  opcion_b: string;
  opcion_c: string;
  id_evaluacion: number;
}

export interface EvaluacionResultadoDetalle {
  id_respuesta: number;
  enunciado_pregunta: string;
  opcion_elegida: 'A' | 'B' | 'C';
  opcion_correcta: 'A' | 'B' | 'C';
  es_correcta: boolean;
  mensaje: string;
  explicacion_correcta?: string | null;
}

export interface LeaderboardEntry {
  id_puntaje: number;
  id_usuario: number;
  nombre_usuario: string;
  calificacion: number;
  fecha_realizacion: string;
  posicion: number;
  es_usuario_actual: boolean;
}

export interface GrantPointsResult {
  otorgado: boolean;
  ya_otorgado: boolean;
  puntos_base: number;
  puntos_adicionales: number;
  total_puntos: number;
  saldo_actual: number;
}

export interface PointRule {
  clave: 'evaluacion_completada' | 'video_visto';
  puntos_base: number;
  puntos_adicionales: number;
  descripcion: string;
  actualizado_en: string;
}

export interface PointMovement {
  id_movimiento: number;
  tipo: 'ganado' | 'canjeado';
  fuente: 'evaluacion' | 'video' | 'canje';
  referencia_id: number;
  puntos_base: number;
  puntos_adicionales: number;
  total_puntos: number;
  descripcion: string;
  fecha_movimiento: string;
}

export interface RewardCatalogItem {
  id_recompensa: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: 'fondo' | 'estilo';
  costo_puntos: number;
  valor_css: string;
  preview_color: string;
  adquirida: boolean;
  equipada: boolean;
}

export interface StoreSnapshot {
  saldo: number;
  fondo_activo: string | null;
  estilo_activo: string | null;
  reglas: PointRule[];
  recompensas: RewardCatalogItem[];
  historial: PointMovement[];
}

export interface EvaluacionResultado {
  calificacion: number;
  porcentaje: number;
  aciertos: number;
  total_preguntas: number;
  puntaje_guardado: {
    id_puntaje: number;
    calificacion: number;
    fecha_realizacion: string;
  } | null;
  leaderboard?: LeaderboardEntry[];
  puntos_otorgados?: GrantPointsResult;
  detalle: EvaluacionResultadoDetalle[];
}

export type DuelRoomStatus = 'esperando' | 'en_curso' | 'finalizada' | 'cancelada';

export interface DuelParticipantView {
  id_usuario: number;
  nombre_usuario: string;
  estado: 'conectado' | 'finalizado' | 'desconectado';
  en_linea: boolean;
  puntuacion: number;
  aciertos: number;
  respondidas: number;
  total_preguntas: number;
  tiempo_ms: number | null;
  es_usuario_actual: boolean;
}

export interface DuelQuestionView {
  orden: number;
  id_respuesta: number;
  enunciado_pregunta: string;
  opcion_a: string;
  opcion_b: string;
  opcion_c: string;
  mi_opcion: 'A' | 'B' | 'C' | null;
}

export interface DuelQuestionComparison {
  orden: number;
  id_respuesta: number;
  enunciado_pregunta: string;
  opcion_a: string;
  opcion_b: string;
  opcion_c: string;
  opcion_correcta: 'A' | 'B' | 'C';
  explicacion: string | null;
  respuestas_por_usuario: Record<
    number,
    {
      opcion_elegida: 'A' | 'B' | 'C';
      es_correcta: boolean;
    } | null
  >;
}

export interface DuelRoomSnapshot {
  id_sala: number;
  codigo: string;
  id_saber: number;
  saber_titulo: string;
  nombre_grado: string;
  id_creador: number;
  estado: DuelRoomStatus;
  creada_en: string;
  iniciada_en_ms: number | null;
  finalizada_en_ms: number | null;
  motivo_cierre: string | null;
  id_ganador: number | null;
  participantes: DuelParticipantView[];
  preguntas: DuelQuestionView[];
  comparacion: DuelQuestionComparison[] | null;
}

export interface DuelHistoryItem {
  id_sala: number;
  codigo: string;
  id_saber: number;
  saber_titulo: string;
  estado: DuelRoomStatus;
  creada_en: string;
  motivo_cierre: string | null;
  id_ganador: number | null;
  mi_puntuacion: number;
  mi_aciertos: number;
  total_preguntas: number;
  mi_tiempo_ms: number | null;
  oponente_nombre: string | null;
  oponente_puntuacion: number | null;
  oponente_aciertos: number | null;
  oponente_tiempo_ms: number | null;
}

