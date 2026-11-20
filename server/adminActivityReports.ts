import { db } from './db.ts';

export type ReportPeriodPreset = '7d' | '30d' | '90d' | 'all';
export type ReportGranularity = 'diaria' | 'semanal' | 'mensual';
export type ActivityIntensity = 'power' | 'regular' | 'esporadico' | 'inactivo';

export interface AdminActivityFilters {
  periodo?: ReportPeriodPreset;
  granularidad?: ReportGranularity;
  idRol?: number | 'all';
  idGrado?: number | 'all';
  estadoActividad?: ActivityIntensity | 'all';
  desde?: string | null;
  hasta?: string | null;
}

export interface TimeBucketRow {
  clave_periodo: string;
  etiqueta: string;
  usuarios_activos: number;
  sesiones: number;
  tiempo_activo_min: number;
  eventos_funcionales: number;
}

export interface FeatureAdoptionRow {
  clave_modulo: string;
  nombre_modulo: string;
  descripcion: string;
  usuarios_unicos: number;
  tasa_adopcion_pct: number;
  eventos_totales: number;
  eventos_por_adoptante: number;
  participacion_eventos_pct: number;
}

export interface SegmentBreakdownRow {
  segmento: string;
  detalle: string;
  registrados: number;
  activos: number;
  tasa_activacion_pct: number;
  sesiones: number;
  tiempo_activo_min: number;
  eventos_totales: number;
  promedio_tiempo_por_activo_min: number;
}

export interface WeekdayPatternRow {
  dia_indice: number;
  dia_nombre: string;
  sesiones: number;
  tiempo_activo_min: number;
}

export interface DaypartPatternRow {
  franja: string;
  rango_horas: string;
  sesiones: number;
  tiempo_activo_min: number;
  participacion_sesiones_pct: number;
}

export interface UserActivityDetailRow {
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
}

export interface AdminActivityReportPayload {
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
  serie_temporal: TimeBucketRow[];
  uso_funcionalidades: FeatureAdoptionRow[];
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
    por_rol: SegmentBreakdownRow[];
    por_grado: SegmentBreakdownRow[];
  };
  patrones_temporales: {
    dia_pico: string | null;
    franja_pico: string | null;
    por_dia_semana: WeekdayPatternRow[];
    por_franja_horaria: DaypartPatternRow[];
  };
  usuarios_detalle: UserActivityDetailRow[];
  criterios_y_errores_comunes: {
    supuestos_plataforma: string[];
    errores_interpretacion: Array<{
      error: string;
      como_evitarlo: string;
    }>;
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function toIsoDate(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function diffDaysIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function normalizeDatePrefix(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const prefix = trimmed.slice(0, 10);
  return DATE_RE.test(prefix) ? prefix : null;
}

function getIsoWeekKey(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`;
}

function getBucketInfo(
  isoDate: string,
  granularidad: ReportGranularity
): { key: string; label: string } {
  if (granularidad === 'mensual') {
    const key = isoDate.slice(0, 7);
    return { key, label: key };
  }
  if (granularidad === 'semanal') {
    const key = getIsoWeekKey(isoDate);
    return { key, label: key };
  }
  return { key: isoDate, label: isoDate };
}

function resolveDateRange(filters: AdminActivityFilters): {
  periodo: ReportPeriodPreset;
  desde: string | null;
  hasta: string | null;
  todayIso: string;
} {
  const todayIso = toIsoDate(Date.now());
  const customDesde = normalizeDatePrefix(filters.desde);
  const customHasta = normalizeDatePrefix(filters.hasta);

  if (customDesde || customHasta) {
    return {
      periodo: filters.periodo ?? '30d',
      desde: customDesde,
      hasta: customHasta ?? todayIso,
      todayIso,
    };
  }

  const periodo: ReportPeriodPreset = filters.periodo ?? '30d';
  if (periodo === 'all') {
    return { periodo, desde: null, hasta: null, todayIso };
  }
  const days = periodo === '7d' ? 7 : periodo === '90d' ? 90 : 30;
  return {
    periodo,
    desde: addDaysIso(todayIso, -(days - 1)),
    hasta: todayIso,
    todayIso,
  };
}

function inDateRange(isoDate: string | null, desde: string | null, hasta: string | null): boolean {
  if (!isoDate) return false;
  if (desde && isoDate < desde) return false;
  if (hasta && isoDate > hasta) return false;
  return true;
}

export function buildAdminActivityReport(
  filters: AdminActivityFilters = {}
): AdminActivityReportPayload {
  const granularidad: ReportGranularity = filters.granularidad ?? 'diaria';
  const idRolFilter =
    typeof filters.idRol === 'number' && Number.isInteger(filters.idRol) && filters.idRol > 0
      ? filters.idRol
      : 'all';
  const idGradoFilter =
    typeof filters.idGrado === 'number' && Number.isInteger(filters.idGrado) && filters.idGrado > 0
      ? filters.idGrado
      : 'all';
  const estadoFilter: ActivityIntensity | 'all' = filters.estadoActividad ?? 'all';

  const { periodo, desde, hasta, todayIso } = resolveDateRange(filters);

  // 1. Universo base de usuarios (filtrado por rol y grado si aplica)
  const rawUsers = db
    .prepare(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.id_rol, r.nombre_rol,
              COALESCE(e.id_grado, p.id_grado) AS id_grado_asignado,
              g.nombre_grado, g.seccion
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
       LEFT JOIN estudiante e ON e.id_usuario = u.id_usuario
       LEFT JOIN profesor p ON p.id_usuario = u.id_usuario
       LEFT JOIN grado g ON g.id_grado = COALESCE(e.id_grado, p.id_grado)
       ORDER BY u.id_usuario ASC`
    )
    .all() as Array<{
    id_usuario: number;
    nombre: string;
    apellido: string;
    email: string;
    id_rol: number;
    nombre_rol: string;
    id_grado_asignado: number | null;
    nombre_grado: string | null;
    seccion: string | null;
  }>;

  const filteredUsers = rawUsers.filter((u) => {
    if (idRolFilter !== 'all' && u.id_rol !== idRolFilter) return false;
    if (idGradoFilter !== 'all' && u.id_grado_asignado !== idGradoFilter) return false;
    return true;
  });

  const userMap = new Map(filteredUsers.map((u) => [u.id_usuario, u]));
  const allowedUserIds = new Set(filteredUsers.map((u) => u.id_usuario));

  // 2. Sesiones registradas (tiempo activo real descontando pausas)
  const sessionRows = db
    .prepare(
      `SELECT id_sesion, id_usuario, fecha_dia, inicio_ms, fin_ms, duracion_activa_ms, pausas_ms
       FROM sesion_actividad`
    )
    .all() as Array<{
    id_sesion: number;
    id_usuario: number;
    fecha_dia: string;
    inicio_ms: number;
    fin_ms: number;
    duracion_activa_ms: number;
    pausas_ms: number;
  }>;

  // 3. Eventos por módulo real de la plataforma
  type FeatureEvent = {
    userId: number;
    moduleKey: string;
    fecha: string;
  };
  const allEvents: FeatureEvent[] = [];

  const evalRows = db
    .prepare('SELECT id_usuario, fecha_realizacion FROM puntaje')
    .all() as Array<{ id_usuario: number; fecha_realizacion: string }>;
  for (const r of evalRows) {
    const fecha = normalizeDatePrefix(r.fecha_realizacion);
    if (fecha) allEvents.push({ userId: r.id_usuario, moduleKey: 'evaluaciones', fecha });
  }

  const movRows = db
    .prepare("SELECT id_usuario, fuente, fecha_movimiento FROM movimiento_puntos WHERE fuente IN ('video', 'canje')")
    .all() as Array<{ id_usuario: number; fuente: 'video' | 'canje'; fecha_movimiento: string }>;
  for (const r of movRows) {
    const fecha = normalizeDatePrefix(r.fecha_movimiento);
    if (fecha) {
      allEvents.push({
        userId: r.id_usuario,
        moduleKey: r.fuente === 'video' ? 'videos' : 'tienda',
        fecha,
      });
    }
  }

  const duelRows = db
    .prepare(
      `SELECT cp.id_usuario, COALESCE(cs.iniciada_en_ms, 0) AS iniciada_en_ms, cs.creada_en
       FROM competencia_participante cp
       JOIN competencia_sala cs ON cs.id_sala = cp.id_sala`
    )
    .all() as Array<{ id_usuario: number; iniciada_en_ms: number; creada_en: string }>;
  for (const r of duelRows) {
    const fecha =
      r.iniciada_en_ms > 0 ? toIsoDate(r.iniciada_en_ms) : normalizeDatePrefix(r.creada_en);
    if (fecha) allEvents.push({ userId: r.id_usuario, moduleKey: 'duelos', fecha });
  }

  const roomCreators = db
    .prepare('SELECT id_creador, creada_en FROM sala_virtual')
    .all() as Array<{ id_creador: number; creada_en: string }>;
  for (const r of roomCreators) {
    const fecha = normalizeDatePrefix(r.creada_en);
    if (fecha) allEvents.push({ userId: r.id_creador, moduleKey: 'salas', fecha });
  }

  const roomMsgs = db
    .prepare('SELECT id_usuario, enviado_en_ms FROM sala_virtual_mensaje')
    .all() as Array<{ id_usuario: number; enviado_en_ms: number }>;
  for (const r of roomMsgs) {
    allEvents.push({ userId: r.id_usuario, moduleKey: 'salas', fecha: toIsoDate(r.enviado_en_ms) });
  }

  const surveyRows = db
    .prepare('SELECT id_usuario, fecha_registro FROM encuesta_satisfaccion')
    .all() as Array<{ id_usuario: number; fecha_registro: string }>;
  for (const r of surveyRows) {
    const fecha = normalizeDatePrefix(r.fecha_registro);
    if (fecha) allEvents.push({ userId: r.id_usuario, moduleKey: 'encuestas', fecha });
  }

  // Acumuladores por usuario dentro del rango y universo filtrado
  const userStats = new Map<
    number,
    {
      sesiones: number;
      activeMs: number;
      pausedMs: number;
      activeDays: Set<string>;
      events: number;
      modules: Set<string>;
      lastDate: string | null;
    }
  >();

  for (const uid of allowedUserIds) {
    userStats.set(uid, {
      sesiones: 0,
      activeMs: 0,
      pausedMs: 0,
      activeDays: new Set(),
      events: 0,
      modules: new Set(),
      lastDate: null,
    });
  }

  // Ventanas fijas para DAU / WAU / MAU dentro del segmento elegido (rol/grado)
  const wauWindowStart = addDaysIso(todayIso, -6);
  const mauWindowStart = addDaysIso(todayIso, -29);
  const wauUsers = new Set<number>();
  const mauUsers = new Set<number>();
  const dauByDayAll = new Map<string, Set<number>>();

  // Series y patrones dentro del periodo seleccionado
  const bucketMap = new Map<
    string,
    {
      label: string;
      activeUsers: Set<number>;
      sesiones: number;
      activeMs: number;
      events: number;
    }
  >();

  const weekdayStats: Array<{ sesiones: number; activeMs: number }> = Array.from(
    { length: 7 },
    () => ({ sesiones: 0, activeMs: 0 })
  );
  const dayparts = [
    { franja: 'Madrugada', rango: '00:00 – 05:59', sesiones: 0, activeMs: 0 },
    { franja: 'Mañana', rango: '06:00 – 11:59', sesiones: 0, activeMs: 0 },
    { franja: 'Tarde', rango: '12:00 – 17:59', sesiones: 0, activeMs: 0 },
    { franja: 'Noche', rango: '18:00 – 23:59', sesiones: 0, activeMs: 0 },
  ];

  let totalSesiones = 0;
  let totalActiveMs = 0;
  let totalPausedMs = 0;

  for (const s of sessionRows) {
    if (!allowedUserIds.has(s.id_usuario)) continue;
    const fecha = normalizeDatePrefix(s.fecha_dia) ?? toIsoDate(s.inicio_ms);

    // WAU / MAU sobre universo filtrado
    if (fecha >= wauWindowStart && fecha <= todayIso) wauUsers.add(s.id_usuario);
    if (fecha >= mauWindowStart && fecha <= todayIso) mauUsers.add(s.id_usuario);

    if (!inDateRange(fecha, desde, hasta)) continue;

    totalSesiones += 1;
    totalActiveMs += s.duracion_activa_ms;
    totalPausedMs += s.pausas_ms;

    if (!dauByDayAll.has(fecha)) dauByDayAll.set(fecha, new Set());
    dauByDayAll.get(fecha)!.add(s.id_usuario);

    const uStat = userStats.get(s.id_usuario)!;
    uStat.sesiones += 1;
    uStat.activeMs += s.duracion_activa_ms;
    uStat.pausedMs += s.pausas_ms;
    uStat.activeDays.add(fecha);
    if (!uStat.lastDate || fecha > uStat.lastDate) uStat.lastDate = fecha;

    const bucket = getBucketInfo(fecha, granularidad);
    if (!bucketMap.has(bucket.key)) {
      bucketMap.set(bucket.key, {
        label: bucket.label,
        activeUsers: new Set(),
        sesiones: 0,
        activeMs: 0,
        events: 0,
      });
    }
    const b = bucketMap.get(bucket.key)!;
    b.activeUsers.add(s.id_usuario);
    b.sesiones += 1;
    b.activeMs += s.duracion_activa_ms;

    const dt = new Date(s.inicio_ms);
    const dayIdx = dt.getDay();
    weekdayStats[dayIdx].sesiones += 1;
    weekdayStats[dayIdx].activeMs += s.duracion_activa_ms;

    const hour = dt.getHours();
    const dpIdx = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
    dayparts[dpIdx].sesiones += 1;
    dayparts[dpIdx].activeMs += s.duracion_activa_ms;
  }

  const MODULE_META: Array<{ key: string; nombre: string; descripcion: string }> = [
    {
      key: 'evaluaciones',
      nombre: 'Evaluaciones ABC',
      descripcion: 'Presentación e intentos de evaluaciones formativas por saber.',
    },
    {
      key: 'videos',
      nombre: 'Videos Educativos',
      descripcion: 'Reproducciones completas registradas con progreso académico.',
    },
    {
      key: 'salas',
      nombre: 'Salas Virtuales en Vivo',
      descripcion: 'Creación de salas de estudio e intercambio en tiempo real.',
    },
    {
      key: 'duelos',
      nombre: 'Duelos Competitivos',
      descripcion: 'Participación en retos cronometrados entre pares.',
    },
    {
      key: 'tienda',
      nombre: 'Tienda de Recompensas',
      descripcion: 'Canjes de puntos por personalización visual de cuenta.',
    },
    {
      key: 'encuestas',
      nombre: 'Encuestas de Satisfacción',
      descripcion: 'Valoración de experiencia y comentarios de usuarios.',
    },
  ];

  const moduleStats = new Map<string, { users: Set<number>; events: number }>();
  for (const m of MODULE_META) {
    moduleStats.set(m.key, { users: new Set(), events: 0 });
  }

  let totalEventosFuncionales = 0;

  for (const ev of allEvents) {
    if (!allowedUserIds.has(ev.userId)) continue;
    if (ev.fecha >= wauWindowStart && ev.fecha <= todayIso) wauUsers.add(ev.userId);
    if (ev.fecha >= mauWindowStart && ev.fecha <= todayIso) mauUsers.add(ev.userId);

    if (!inDateRange(ev.fecha, desde, hasta)) continue;

    totalEventosFuncionales += 1;
    if (!dauByDayAll.has(ev.fecha)) dauByDayAll.set(ev.fecha, new Set());
    dauByDayAll.get(ev.fecha)!.add(ev.userId);

    const mod = moduleStats.get(ev.moduleKey);
    if (mod) {
      mod.users.add(ev.userId);
      mod.events += 1;
    }

    const uStat = userStats.get(ev.userId)!;
    uStat.events += 1;
    uStat.modules.add(ev.moduleKey);
    uStat.activeDays.add(ev.fecha);
    if (!uStat.lastDate || ev.fecha > uStat.lastDate) uStat.lastDate = ev.fecha;

    const bucket = getBucketInfo(ev.fecha, granularidad);
    if (!bucketMap.has(bucket.key)) {
      bucketMap.set(bucket.key, {
        label: bucket.label,
        activeUsers: new Set(),
        sesiones: 0,
        activeMs: 0,
        events: 0,
      });
    }
    const b = bucketMap.get(bucket.key)!;
    b.activeUsers.add(ev.userId);
    b.events += 1;
  }

  // Clasificar intensidad de cada usuario y armar detalle completo
  const allUserDetails: UserActivityDetailRow[] = [];
  for (const u of filteredUsers) {
    const st = userStats.get(u.id_usuario)!;
    const isActive = st.sesiones > 0 || st.events > 0;
    const daysSinceLast = st.lastDate ? diffDaysIso(st.lastDate, todayIso) : null;

    let nivel: ActivityIntensity = 'inactivo';
    if (isActive) {
      if (st.activeDays.size >= 4 || st.events >= 5 || st.activeMs >= 30 * 60_000) {
        nivel = 'power';
      } else if (st.activeDays.size >= 2 || st.events >= 2 || st.sesiones >= 2) {
        nivel = 'regular';
      } else {
        nivel = 'esporadico';
      }
    }

    allUserDetails.push({
      id_usuario: u.id_usuario,
      nombre_completo: `${u.nombre} ${u.apellido}`,
      email: u.email,
      nombre_rol: u.nombre_rol,
      grado_label: u.nombre_grado ? `${u.nombre_grado}${u.seccion ? ` (${u.seccion})` : ''}` : 'Sin grado',
      sesiones: st.sesiones,
      dias_activos: st.activeDays.size,
      tiempo_activo_min: Number((st.activeMs / 60_000).toFixed(2)),
      tiempo_pausado_min: Number((st.pausedMs / 60_000).toFixed(2)),
      eventos_totales: st.events,
      modulos_usados: Array.from(st.modules),
      tiene_accion_valor: st.events > 0,
      ultima_actividad_fecha: st.lastDate,
      dias_sin_actividad: daysSinceLast,
      nivel_intensidad: nivel,
    });
  }

  const registradosCount = allUserDetails.length;
  const activeUsersDetails = allUserDetails.filter((u) => u.nivel_intensidad !== 'inactivo');
  const activeUsersCount = activeUsersDetails.length;
  const valueUsersCount = allUserDetails.filter((u) => u.tiene_accion_valor).length;
  const inactiveUsersCount = registradosCount - activeUsersCount;

  const dauAvg =
    dauByDayAll.size > 0
      ? Number(
          (
            Array.from(dauByDayAll.values()).reduce((acc, set) => acc + set.size, 0) /
            dauByDayAll.size
          ).toFixed(2)
        )
      : 0;
  const wauCount = wauUsers.size;
  const mauCount = mauUsers.size;
  const stickinessPct = mauCount > 0 ? Number(((dauAvg / mauCount) * 100).toFixed(1)) : 0;

  const totalAttentionWindow = totalActiveMs + totalPausedMs;
  const tasaAtencionPct =
    totalAttentionWindow > 0
      ? Number(((totalActiveMs / totalAttentionWindow) * 100).toFixed(1))
      : activeUsersCount > 0
        ? 100
        : 0;

  // Serie temporal ordenada cronológicamente
  const serieTemporal: TimeBucketRow[] = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave_periodo, data]) => ({
      clave_periodo,
      etiqueta: data.label,
      usuarios_activos: data.activeUsers.size,
      sesiones: data.sesiones,
      tiempo_activo_min: Number((data.activeMs / 60_000).toFixed(2)),
      eventos_funcionales: data.events,
    }));

  // Uso por funcionalidad
  const baseAdoptionDenom = Math.max(1, activeUsersCount);
  const usoFuncionalidades: FeatureAdoptionRow[] = MODULE_META.map((m) => {
    const st = moduleStats.get(m.key)!;
    const usuariosUnicos = st.users.size;
    return {
      clave_modulo: m.key,
      nombre_modulo: m.nombre,
      descripcion: m.descripcion,
      usuarios_unicos: usuariosUnicos,
      tasa_adopcion_pct:
        activeUsersCount > 0 ? Number(((usuariosUnicos / baseAdoptionDenom) * 100).toFixed(1)) : 0,
      eventos_totales: st.events,
      eventos_por_adoptante:
        usuariosUnicos > 0 ? Number((st.events / usuariosUnicos).toFixed(2)) : 0,
      participacion_eventos_pct:
        totalEventosFuncionales > 0
          ? Number(((st.events / totalEventosFuncionales) * 100).toFixed(1))
          : 0,
    };
  }).sort((a, b) => b.eventos_totales - a.eventos_totales || b.usuarios_unicos - a.usuarios_unicos);

  // Concentración Pareto Top 20% sobre usuarios activos
  const top20Count = activeUsersCount > 0 ? Math.max(1, Math.ceil(activeUsersCount * 0.2)) : 0;
  const sortedByTime = [...activeUsersDetails].sort((a, b) => b.tiempo_activo_min - a.tiempo_activo_min);
  const top20TimeSum = sortedByTime
    .slice(0, top20Count)
    .reduce((acc, u) => acc + u.tiempo_activo_min, 0);
  const totalTimeMin = Number((totalActiveMs / 60_000).toFixed(2));
  const paretoTimePct =
    totalTimeMin > 0 ? Number(((top20TimeSum / totalTimeMin) * 100).toFixed(1)) : 0;

  const sortedByEvents = [...activeUsersDetails].sort((a, b) => b.eventos_totales - a.eventos_totales);
  const top20EventsSum = sortedByEvents
    .slice(0, top20Count)
    .reduce((acc, u) => acc + u.eventos_totales, 0);
  const paretoEventsPct =
    totalEventosFuncionales > 0
      ? Number(((top20EventsSum / totalEventosFuncionales) * 100).toFixed(1))
      : 0;

  const alertaConcentracion =
    activeUsersCount === 0
      ? 'Aún no hay actividad suficiente en el rango seleccionado para medir concentración.'
      : Math.max(paretoTimePct, paretoEventsPct) >= 70
        ? `Concentración alta: el 20% superior (${top20Count} usuario(s)) concentra ${Math.max(
            paretoTimePct,
            paretoEventsPct
          )}% de la actividad. Conviene impulsar adopción en cuentas rezagadas.`
        : `Distribución saludable: el 20% superior concentra ${Math.max(
            paretoTimePct,
            paretoEventsPct
          )}% del uso sin dependencia extrema de un subgrupo reducido.`;

  // Distribución por intensidad
  const intensityMeta: Array<{ nivel: ActivityIntensity; etiqueta: string }> = [
    { nivel: 'power', etiqueta: 'Uso intensivo (Power users)' },
    { nivel: 'regular', etiqueta: 'Uso regular' },
    { nivel: 'esporadico', etiqueta: 'Uso esporádico' },
    { nivel: 'inactivo', etiqueta: 'Sin actividad en el periodo' },
  ];
  const distribucionIntensidad = intensityMeta.map((im) => {
    const count = allUserDetails.filter((u) => u.nivel_intensidad === im.nivel).length;
    return {
      nivel: im.nivel,
      etiqueta: im.etiqueta,
      usuarios: count,
      porcentaje: registradosCount > 0 ? Number(((count / registradosCount) * 100).toFixed(1)) : 0,
    };
  });

  // Segmentación por Rol
  const roleMap = new Map<string, UserActivityDetailRow[]>();
  for (const u of allUserDetails) {
    if (!roleMap.has(u.nombre_rol)) roleMap.set(u.nombre_rol, []);
    roleMap.get(u.nombre_rol)!.push(u);
  }
  const porRol: SegmentBreakdownRow[] = Array.from(roleMap.entries()).map(([rol, list]) => {
    const activos = list.filter((x) => x.nivel_intensidad !== 'inactivo');
    const ses = list.reduce((a, b) => a + b.sesiones, 0);
    const tMin = Number(list.reduce((a, b) => a + b.tiempo_activo_min, 0).toFixed(2));
    const evs = list.reduce((a, b) => a + b.eventos_totales, 0);
    return {
      segmento: rol,
      detalle: `${activos.length} de ${list.length} cuentas activas`,
      registrados: list.length,
      activos: activos.length,
      tasa_activacion_pct:
        list.length > 0 ? Number(((activos.length / list.length) * 100).toFixed(1)) : 0,
      sesiones: ses,
      tiempo_activo_min: tMin,
      eventos_totales: evs,
      promedio_tiempo_por_activo_min:
        activos.length > 0 ? Number((tMin / activos.length).toFixed(2)) : 0,
    };
  });

  // Segmentación por Grado
  const gradeMap = new Map<string, UserActivityDetailRow[]>();
  for (const u of allUserDetails) {
    if (!gradeMap.has(u.grado_label)) gradeMap.set(u.grado_label, []);
    gradeMap.get(u.grado_label)!.push(u);
  }
  const porGrado: SegmentBreakdownRow[] = Array.from(gradeMap.entries())
    .map(([grado, list]) => {
      const activos = list.filter((x) => x.nivel_intensidad !== 'inactivo');
      const ses = list.reduce((a, b) => a + b.sesiones, 0);
      const tMin = Number(list.reduce((a, b) => a + b.tiempo_activo_min, 0).toFixed(2));
      const evs = list.reduce((a, b) => a + b.eventos_totales, 0);
      return {
        segmento: grado,
        detalle: `${activos.length} de ${list.length} cuentas activas`,
        registrados: list.length,
        activos: activos.length,
        tasa_activacion_pct:
          list.length > 0 ? Number(((activos.length / list.length) * 100).toFixed(1)) : 0,
        sesiones: ses,
        tiempo_activo_min: tMin,
        eventos_totales: evs,
        promedio_tiempo_por_activo_min:
          activos.length > 0 ? Number((tMin / activos.length).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.eventos_totales - a.eventos_totales || b.tiempo_activo_min - a.tiempo_activo_min);

  // Patrones temporales (orden Lunes..Domingo para lectura ejecutiva)
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  const porDiaSemana: WeekdayPatternRow[] = weekdayOrder.map((idx) => ({
    dia_indice: idx,
    dia_nombre: WEEKDAY_NAMES[idx],
    sesiones: weekdayStats[idx].sesiones,
    tiempo_activo_min: Number((weekdayStats[idx].activeMs / 60_000).toFixed(2)),
  }));
  const peakDayRow = [...porDiaSemana].sort(
    (a, b) => b.sesiones - a.sesiones || b.tiempo_activo_min - a.tiempo_activo_min
  )[0];
  const diaPico = peakDayRow && peakDayRow.sesiones > 0 ? peakDayRow.dia_nombre : null;

  const porFranjaHoraria: DaypartPatternRow[] = dayparts.map((dp) => ({
    franja: dp.franja,
    rango_horas: dp.rango,
    sesiones: dp.sesiones,
    tiempo_activo_min: Number((dp.activeMs / 60_000).toFixed(2)),
    participacion_sesiones_pct:
      totalSesiones > 0 ? Number(((dp.sesiones / totalSesiones) * 100).toFixed(1)) : 0,
  }));
  const peakDaypartRow = [...porFranjaHoraria].sort(
    (a, b) => b.sesiones - a.sesiones || b.tiempo_activo_min - a.tiempo_activo_min
  )[0];
  const franjaPico =
    peakDaypartRow && peakDaypartRow.sesiones > 0
      ? `${peakDaypartRow.franja} (${peakDaypartRow.rango_horas})`
      : null;

  // Aplicar filtro de estadoActividad sobre la tabla de detalle accionable
  const filteredUserDetails =
    estadoFilter === 'all'
      ? allUserDetails
      : allUserDetails.filter((u) => u.nivel_intensidad === estadoFilter);

  filteredUserDetails.sort(
    (a, b) =>
      b.eventos_totales - a.eventos_totales ||
      b.tiempo_activo_min - a.tiempo_activo_min ||
      a.id_usuario - b.id_usuario
  );

  return {
    parametros: {
      periodo,
      granularidad,
      desde,
      hasta,
      id_rol: idRolFilter,
      id_grado: idGradoFilter,
      estado_actividad: estadoFilter,
    },
    resumen_adopcion: {
      usuarios_registrados: registradosCount,
      usuarios_activos_periodo: activeUsersCount,
      usuarios_con_valor: valueUsersCount,
      usuarios_inactivos: inactiveUsersCount,
      tasa_activacion_pct:
        registradosCount > 0 ? Number(((activeUsersCount / registradosCount) * 100).toFixed(1)) : 0,
      tasa_valor_real_pct:
        registradosCount > 0 ? Number(((valueUsersCount / registradosCount) * 100).toFixed(1)) : 0,
      dau_promedio: dauAvg,
      wau_actual: wauCount,
      mau_actual: mauCount,
      stickiness_dau_mau_pct: stickinessPct,
      total_sesiones: totalSesiones,
      sesiones_por_usuario_activo:
        activeUsersCount > 0 ? Number((totalSesiones / activeUsersCount).toFixed(2)) : 0,
      tiempo_activo_total_min: totalTimeMin,
      tiempo_pausado_total_min: Number((totalPausedMs / 60_000).toFixed(2)),
      tiempo_promedio_sesion_min:
        totalSesiones > 0 ? Number((totalTimeMin / totalSesiones).toFixed(2)) : 0,
      tasa_atencion_efectiva_pct: tasaAtencionPct,
      total_eventos_funcionales: totalEventosFuncionales,
    },
    serie_temporal: serieTemporal,
    uso_funcionalidades: usoFuncionalidades,
    concentracion: {
      indice_pareto_top20_tiempo_pct: paretoTimePct,
      indice_pareto_top20_eventos_pct: paretoEventsPct,
      top_20_usuarios_cantidad: top20Count,
      alerta_concentracion: alertaConcentracion,
      distribucion_intensidad: distribucionIntensidad,
      por_rol: porRol,
      por_grado: porGrado,
    },
    patrones_temporales: {
      dia_pico: diaPico,
      franja_pico: franjaPico,
      por_dia_semana: porDiaSemana,
      por_franja_horaria: porFranjaHoraria,
    },
    usuarios_detalle: filteredUserDetails,
    criterios_y_errores_comunes: {
      supuestos_plataforma: [
        'Plataforma web multi-rol (Administrador, Profesor, Estudiante) organizada por grados/equipos escolares.',
        'La tabla de usuarios actual no almacena fecha de registro ni plan comercial; por ello la segmentación usa rol, grado asignado e intensidad de actividad.',
        'La actividad de valor se mide mediante acciones reales completadas (evaluaciones, videos, salas en vivo, duelos, canjes y encuestas), separada del simple inicio de sesión.',
      ],
      errores_interpretacion: [
        {
          error: 'Confundir usuarios registrados con usuarios activos',
          como_evitarlo:
            'Comparar siempre el total de cuentas creadas frente a los usuarios que iniciaron sesión o ejecutaron una acción en el periodo.',
        },
        {
          error: 'Confundir tiempo en pantalla o clics con valor real',
          como_evitarlo:
            'Cruzar tiempo activo (sin pausas) con la tasa de usuarios que completaron evaluaciones, videos o interacciones en salas.',
        },
        {
          error: 'Mirar promedios globales sin revisar concentración',
          como_evitarlo:
            'Verificar el índice Pareto Top 20% y desglosar por rol y grado para evitar que pocos usuarios intensivos oculten baja adopción.',
        },
      ],
    },
  };
}
