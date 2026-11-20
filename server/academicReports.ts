import { db } from './db.ts';

export const PASS_THRESHOLD = 3.0;
export const CONSOLIDATED_THRESHOLD = 4.0;
export const REINFORCEMENT_THRESHOLD = 3.5;
export const TREND_DELTA_THRESHOLD = 0.3;

export type PerformanceLevel =
  | 'Consolidado'
  | 'En proceso'
  | 'Requiere apoyo'
  | 'Sin evaluaciones';

export type TrendDirection = 'alza' | 'estable' | 'descenso' | 'sin_tendencia';

export interface StudentAcademicSummary {
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
  tendencia: TrendDirection;
  delta_tendencia: number;
  nivel_desempeno: PerformanceLevel;
  caida_sostenida: boolean;
}

export interface GroupComparisonRow {
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

export interface CompetencyMasteryRow {
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

export interface PedagogicalAlert {
  id: string;
  tipo: 'caida_sostenida' | 'bajo_desempeno' | 'sin_actividad' | 'dificultad_grupal';
  severidad: 'alta' | 'media';
  titulo: string;
  detalle: string;
  id_estudiante?: number;
  id_saber?: number;
}

export interface SaberInterestRow {
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

export interface TeacherAcademicReport {
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

export interface PrivateStudentReport {
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
    tendencia: TrendDirection;
    delta_tendencia: number;
    nivel_desempeno: PerformanceLevel;
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

function classifyPerformance(avg: number | null): PerformanceLevel {
  if (avg === null) return 'Sin evaluaciones';
  if (avg >= CONSOLIDATED_THRESHOLD) return 'Consolidado';
  if (avg >= PASS_THRESHOLD) return 'En proceso';
  return 'Requiere apoyo';
}

function computeTrend(chronologicalScores: number[]): {
  tendencia: TrendDirection;
  delta: number;
  caidaSostenida: boolean;
} {
  if (chronologicalScores.length < 2) {
    return { tendencia: 'sin_tendencia', delta: 0, caidaSostenida: false };
  }

  const mid = Math.floor(chronologicalScores.length / 2);
  const firstHalf = chronologicalScores.slice(0, mid);
  const secondHalf = chronologicalScores.slice(mid);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const delta = Number((avgSecond - avgFirst).toFixed(2));

  let tendencia: TrendDirection = 'estable';
  if (delta >= TREND_DELTA_THRESHOLD) {
    tendencia = 'alza';
  } else if (delta <= -TREND_DELTA_THRESHOLD) {
    tendencia = 'descenso';
  }

  // Caída sostenida: descenso significativo (>= 0.40) o dos bajas consecutivas en las últimas 3 notas
  let twoConsecutiveDrops = false;
  if (chronologicalScores.length >= 3) {
    const len = chronologicalScores.length;
    const s1 = chronologicalScores[len - 3];
    const s2 = chronologicalScores[len - 2];
    const s3 = chronologicalScores[len - 1];
    if (s2 < s1 && s3 < s2) {
      twoConsecutiveDrops = true;
    }
  }

  const latest = chronologicalScores[chronologicalScores.length - 1];
  const caidaSostenida =
    delta <= -0.4 || (twoConsecutiveDrops && latest < REINFORCEMENT_THRESHOLD);

  return { tendencia, delta, caidaSostenida };
}

export function getTeacherAcademicReport(params: {
  filtroGradoId?: number | null;
}): TeacherAcademicReport {
  const filtroGradoId =
    params.filtroGradoId && Number.isInteger(params.filtroGradoId) && params.filtroGradoId > 0
      ? params.filtroGradoId
      : null;

  const totalEvaluacionesCatalogo = (
    db.prepare('SELECT COUNT(*) as total FROM evaluacion').get() as { total: number }
  ).total;

  // 1. Estudiantes base (filtrados o todos)
  const studentRows = db
    .prepare(
      `SELECT est.id_estudiante, est.id_usuario, est.codigo_estudiantil, est.id_grado,
              u.nombre, u.apellido, u.email, g.nombre_grado, g.seccion
       FROM estudiante est
       JOIN usuario u ON u.id_usuario = est.id_usuario
       JOIN grado g ON g.id_grado = est.id_grado
       ${filtroGradoId ? 'WHERE est.id_grado = ?' : ''}
       ORDER BY est.id_grado ASC, u.apellido ASC, u.nombre ASC`
    )
    .all(...(filtroGradoId ? [filtroGradoId] : [])) as unknown as Array<{
    id_estudiante: number;
    id_usuario: number;
    codigo_estudiantil: string | null;
    id_grado: number;
    nombre: string;
    apellido: string;
    email: string;
    nombre_grado: string;
    seccion: string | null;
  }>;

  // 2. Todos los puntajes cronológicos (para tendencias y comparativas entre grados)
  const allScores = db
    .prepare(
      `SELECT p.id_puntaje, p.id_estudiante, p.id_usuario, p.id_evaluacion, p.calificacion, p.fecha_realizacion,
              e.titulo as evaluacion_titulo, s.id_saber, s.titulo as saber_titulo,
              est.id_grado
       FROM puntaje p
       JOIN evaluacion e ON e.id_evaluacion = p.id_evaluacion
       JOIN saber s ON s.id_saber = e.id_saber
       JOIN estudiante est ON est.id_estudiante = p.id_estudiante
       ORDER BY p.fecha_realizacion ASC, p.id_puntaje ASC`
    )
    .all() as unknown as Array<{
    id_puntaje: number;
    id_estudiante: number;
    id_usuario: number;
    id_evaluacion: number;
    calificacion: number;
    fecha_realizacion: string;
    evaluacion_titulo: string;
    id_saber: number;
    saber_titulo: string;
    id_grado: number;
  }>;

  const videoCounts = db
    .prepare(
      `SELECT id_usuario, COUNT(*) as total
       FROM movimiento_puntos
       WHERE fuente = 'video'
       GROUP BY id_usuario`
    )
    .all() as unknown as Array<{ id_usuario: number; total: number }>;
  const videoMap = new Map<number, number>(videoCounts.map((v) => [v.id_usuario, Number(v.total)]));

  const activeTimeRows = db
    .prepare(
      `SELECT id_usuario, COALESCE(SUM(duracion_activa_ms), 0) as total_ms
       FROM sesion_actividad
       GROUP BY id_usuario`
    )
    .all() as unknown as Array<{ id_usuario: number; total_ms: number }>;
  const timeMap = new Map<number, number>(
    activeTimeRows.map((t) => [t.id_usuario, Number(t.total_ms)])
  );

  const scoresByStudent = new Map<number, typeof allScores>();
  for (const sc of allScores) {
    const list = scoresByStudent.get(sc.id_estudiante) ?? [];
    list.push(sc);
    scoresByStudent.set(sc.id_estudiante, list);
  }

  const estudiantes: StudentAcademicSummary[] = studentRows.map((st) => {
    const stScores = scoresByStudent.get(st.id_estudiante) ?? [];
    const numericScores = stScores.map((s) => Number(s.calificacion));
    const uniqueEvals = new Set(stScores.map((s) => s.id_evaluacion)).size;
    const avg =
      numericScores.length > 0
        ? Number((numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(2))
        : null;
    const ultima = numericScores.length > 0 ? numericScores[numericScores.length - 1] : null;
    const trend = computeTrend(numericScores);
    const cobertura =
      totalEvaluacionesCatalogo > 0
        ? Number(((uniqueEvals / totalEvaluacionesCatalogo) * 100).toFixed(1))
        : 0;
    const tiempoMin = Math.round((timeMap.get(st.id_usuario) ?? 0) / 60000);

    return {
      ...st,
      evaluaciones_realizadas: stScores.length,
      evaluaciones_unicas: uniqueEvals,
      cobertura_pct: cobertura,
      videos_completados: videoMap.get(st.id_usuario) ?? 0,
      tiempo_activo_min: tiempoMin,
      promedio_calificacion: avg,
      ultima_calificacion: ultima,
      tendencia: trend.tendencia,
      delta_tendencia: trend.delta,
      nivel_desempeno: classifyPerformance(avg),
      caida_sostenida: trend.caidaSostenida,
    };
  });

  // 3. Comparativa entre grados (siempre sobre todos los grados para comparar cursos)
  const gradosList = db
    .prepare('SELECT id_grado, nombre_grado, seccion FROM grado ORDER BY id_grado ASC')
    .all() as unknown as Array<{ id_grado: number; nombre_grado: string; seccion: string | null }>;

  const allStudentsRaw = db
    .prepare('SELECT id_estudiante, id_grado FROM estudiante')
    .all() as unknown as Array<{ id_estudiante: number; id_grado: number }>;

  const comparativaGrados: GroupComparisonRow[] = gradosList.map((g) => {
    const gradoStudents = allStudentsRaw.filter((s) => s.id_grado === g.id_grado);
    const gradoScores = allScores.filter((sc) => sc.id_grado === g.id_grado);
    const activeStudents = new Set(gradoScores.map((sc) => sc.id_estudiante));

    let riskCount = 0;
    for (const gs of gradoStudents) {
      const scList = (scoresByStudent.get(gs.id_estudiante) ?? []).map((x) => Number(x.calificacion));
      if (scList.length > 0) {
        const sAvg = scList.reduce((a, b) => a + b, 0) / scList.length;
        if (sAvg < PASS_THRESHOLD) riskCount++;
      }
    }

    const avg =
      gradoScores.length > 0
        ? Number(
            (
              gradoScores.reduce((acc, s) => acc + Number(s.calificacion), 0) / gradoScores.length
            ).toFixed(2)
          )
        : null;
    const passed = gradoScores.filter((s) => Number(s.calificacion) >= PASS_THRESHOLD).length;
    const passPct =
      gradoScores.length > 0 ? Number(((passed / gradoScores.length) * 100).toFixed(1)) : 0;

    return {
      id_grado: g.id_grado,
      nombre_grado: g.nombre_grado,
      seccion: g.seccion,
      total_estudiantes: gradoStudents.length,
      estudiantes_evaluados: activeStudents.size,
      intentos_totales: gradoScores.length,
      promedio_grupo: avg,
      tasa_aprobacion_pct: passPct,
      estudiantes_en_riesgo: riskCount,
    };
  });

  // 4. Competencias / Saberes consolidados vs. para reforzar (en el grupo filtrado o global)
  const saberesBase = db
    .prepare(
      `SELECT s.id_saber, s.titulo as saber_titulo, s.id_grado, g.nombre_grado
       FROM saber s
       JOIN grado g ON g.id_grado = s.id_grado
       ORDER BY s.id_saber ASC`
    )
    .all() as unknown as Array<{
    id_saber: number;
    saber_titulo: string;
    id_grado: number;
    nombre_grado: string;
  }>;

  const filteredStudentIds = new Set(estudiantes.map((e) => e.id_estudiante));
  const relevantScores = filtroGradoId
    ? allScores.filter((s) => filteredStudentIds.has(s.id_estudiante))
    : allScores;

  const competenciasSaberes: CompetencyMasteryRow[] = saberesBase.map((sb) => {
    const sbScores = relevantScores.filter((s) => s.id_saber === sb.id_saber);
    const avg =
      sbScores.length > 0
        ? Number(
            (sbScores.reduce((a, b) => a + Number(b.calificacion), 0) / sbScores.length).toFixed(2)
          )
        : null;
    const passed = sbScores.filter((s) => Number(s.calificacion) >= PASS_THRESHOLD).length;
    const passPct =
      sbScores.length > 0 ? Number(((passed / sbScores.length) * 100).toFixed(1)) : 0;

    let estado: CompetencyMasteryRow['estado_competencia'] = 'Sin datos';
    if (avg !== null) {
      if (avg >= CONSOLIDATED_THRESHOLD && passPct >= 75) {
        estado = 'Consolidado';
      } else if (avg >= REINFORCEMENT_THRESHOLD && passPct >= 60) {
        estado = 'En desarrollo';
      } else {
        estado = 'Requiere refuerzo';
      }
    }

    return {
      id_saber: sb.id_saber,
      saber_titulo: sb.saber_titulo,
      id_grado: sb.id_grado,
      nombre_grado: sb.nombre_grado,
      intentos: sbScores.length,
      estudiantes_evaluados: new Set(sbScores.map((s) => s.id_estudiante)).size,
      promedio_saber: avg,
      tasa_aprobacion_pct: passPct,
      estado_competencia: estado,
    };
  });

  // 4b. Saberes más seleccionados / intereses académicos (evaluaciones + videos + duelos + salas virtuales)
  const saberesMetaRows = db
    .prepare(
      `SELECT s.id_saber, s.titulo as saber_titulo, s.descripcion, s.id_grado, g.nombre_grado
       FROM saber s
       JOIN grado g ON g.id_grado = s.id_grado
       ${filtroGradoId ? 'WHERE s.id_grado = ?' : ''}
       ORDER BY s.id_saber ASC`
    )
    .all(...(filtroGradoId ? [filtroGradoId] : [])) as unknown as Array<{
    id_saber: number;
    saber_titulo: string;
    descripcion: string | null;
    id_grado: number;
    nombre_grado: string;
  }>;

  const videoInteractions = db
    .prepare(
      `SELECT v.id_saber, mp.id_usuario
       FROM movimiento_puntos mp
       JOIN video v ON v.id_video = mp.referencia_id
       WHERE mp.fuente = 'video'`
    )
    .all() as unknown as Array<{ id_saber: number; id_usuario: number }>;

  const duelInteractions = db
    .prepare(
      `SELECT cs.id_saber, cp.id_usuario
       FROM competencia_sala cs
       JOIN competencia_participante cp ON cp.id_sala = cs.id_sala`
    )
    .all() as unknown as Array<{ id_saber: number; id_usuario: number }>;

  const virtualRoomInteractions = db
    .prepare(
      `SELECT id_saber, id_creador as id_usuario
       FROM sala_virtual
       WHERE id_saber IS NOT NULL`
    )
    .all() as unknown as Array<{ id_saber: number; id_usuario: number }>;

  const rawInterestList = saberesMetaRows.map((sb) => {
    const uniqueUsers = new Set<number>();
    const evalsForSaber = relevantScores.filter((s) => s.id_saber === sb.id_saber);
    for (const sc of evalsForSaber) uniqueUsers.add(sc.id_usuario);

    const vidsForSaber = videoInteractions.filter((v) => v.id_saber === sb.id_saber);
    for (const v of vidsForSaber) uniqueUsers.add(v.id_usuario);

    const duelsForSaber = duelInteractions.filter((d) => d.id_saber === sb.id_saber);
    for (const d of duelsForSaber) uniqueUsers.add(d.id_usuario);

    const roomsForSaber = virtualRoomInteractions.filter((r) => r.id_saber === sb.id_saber);
    for (const r of roomsForSaber) uniqueUsers.add(r.id_usuario);

    const totalSelecciones =
      evalsForSaber.length +
      vidsForSaber.length +
      duelsForSaber.length +
      roomsForSaber.length;

    return {
      id_saber: sb.id_saber,
      saber_titulo: sb.saber_titulo,
      descripcion: sb.descripcion,
      id_grado: sb.id_grado,
      nombre_grado: sb.nombre_grado,
      evaluaciones_presentadas: evalsForSaber.length,
      videos_completados: vidsForSaber.length,
      duelos_elegidos: duelsForSaber.length,
      salas_virtuales: roomsForSaber.length,
      estudiantes_unicos: uniqueUsers.size,
      total_selecciones: totalSelecciones,
    };
  });

  const totalInteraccionesSaberes = rawInterestList.reduce(
    (acc, item) => acc + item.total_selecciones,
    0
  );

  const rankingSaberes: SaberInterestRow[] = rawInterestList
    .map((item) => ({
      ...item,
      porcentaje_preferencia:
        totalInteraccionesSaberes > 0
          ? Number(((item.total_selecciones / totalInteraccionesSaberes) * 100).toFixed(1))
          : 0,
    }))
    .sort(
      (a, b) =>
        b.total_selecciones - a.total_selecciones ||
        b.estudiantes_unicos - a.estudiantes_unicos ||
        a.id_saber - b.id_saber
    );

  const nivelConfianzaSaberes: 'alto' | 'medio' | 'bajo' =
    totalInteraccionesSaberes >= 50
      ? 'alto'
      : totalInteraccionesSaberes >= 15
        ? 'medio'
        : 'bajo';

  // 5. Alertas pedagógicas tempranas
  const alertas: PedagogicalAlert[] = [];

  for (const est of estudiantes) {
    if (est.caida_sostenida) {
      alertas.push({
        id: `drop-${est.id_estudiante}`,
        tipo: 'caida_sostenida',
        severidad: 'alta',
        titulo: `Caída sostenida: ${est.nombre} ${est.apellido}`,
        detalle: `Tendencia de ${est.delta_tendencia >= 0 ? '+' : ''}${est.delta_tendencia.toFixed(
          2
        )} pts (promedio ${est.promedio_calificacion?.toFixed(2) ?? '—'} / 5.00). Conviene revisión individual.`,
        id_estudiante: est.id_estudiante,
      });
    } else if (est.promedio_calificacion !== null && est.promedio_calificacion < PASS_THRESHOLD) {
      alertas.push({
        id: `low-${est.id_estudiante}`,
        tipo: 'bajo_desempeno',
        severidad: 'alta',
        titulo: `Requiere apoyo: ${est.nombre} ${est.apellido}`,
        detalle: `Promedio acumulado de ${est.promedio_calificacion.toFixed(
          2
        )} / 5.00, por debajo del umbral aprobatorio (${PASS_THRESHOLD.toFixed(2)}).`,
        id_estudiante: est.id_estudiante,
      });
    } else if (est.evaluaciones_realizadas === 0) {
      alertas.push({
        id: `inactive-${est.id_estudiante}`,
        tipo: 'sin_actividad',
        severidad: 'media',
        titulo: `Sin evaluaciones: ${est.nombre} ${est.apellido}`,
        detalle: `Aún no registra evaluaciones presentadas en ${est.nombre_grado}.`,
        id_estudiante: est.id_estudiante,
      });
    }
  }

  for (const comp of competenciasSaberes) {
    if (comp.estado_competencia === 'Requiere refuerzo') {
      alertas.push({
        id: `saber-${comp.id_saber}`,
        tipo: 'dificultad_grupal',
        severidad: 'media',
        titulo: `Dificultad común en "${comp.saber_titulo}"`,
        detalle: `Promedio grupal de ${comp.promedio_saber?.toFixed(2)} / 5.00 con ${comp.tasa_aprobacion_pct}% de aprobación en ${comp.intentos} intento(s).`,
        id_saber: comp.id_saber,
      });
    }
  }

  // 6. Resumen general del grupo visible
  const conEvaluaciones = estudiantes.filter((e) => e.evaluaciones_realizadas > 0);
  const enRiesgo = estudiantes.filter(
    (e) => e.caida_sostenida || (e.promedio_calificacion !== null && e.promedio_calificacion < PASS_THRESHOLD)
  );
  const promedioGrupo =
    relevantScores.length > 0
      ? Number(
          (
            relevantScores.reduce((acc, s) => acc + Number(s.calificacion), 0) /
            relevantScores.length
          ).toFixed(2)
        )
      : null;
  const passedRelevant = relevantScores.filter(
    (s) => Number(s.calificacion) >= PASS_THRESHOLD
  ).length;
  const tasaAprobacion =
    relevantScores.length > 0
      ? Number(((passedRelevant / relevantScores.length) * 100).toFixed(1))
      : 0;
  const coberturaPromedio =
    estudiantes.length > 0
      ? Number(
          (
            estudiantes.reduce((acc, e) => acc + e.cobertura_pct, 0) / estudiantes.length
          ).toFixed(1)
        )
      : 0;

  return {
    criterios: {
      escala: 'Escala numérica de 0.00 a 5.00 (equivalente a 0% – 100%).',
      umbral_aprobacion: PASS_THRESHOLD,
      umbral_consolidado: CONSOLIDATED_THRESHOLD,
      umbral_refuerzo_grupal: REINFORCEMENT_THRESHOLD,
      criterio_tendencia:
        'Compara el promedio de la segunda mitad de evaluaciones cronológicas frente a la primera mitad: Alza (≥ +0.30 pts), Estable (-0.29 a +0.29 pts), Descenso (≤ -0.30 pts).',
      criterio_caida_sostenida:
        'Se activa cuando el estudiante acumula una caída ≥ 0.40 pts entre sus evaluaciones iniciales y recientes, o dos descensos consecutivos terminando por debajo de 3.50.',
      datos_disponibles: [
        'Calificaciones y fechas de evaluaciones interactivas (escala 0.00–5.00)',
        'Saberes / competencias asociadas a cada evaluación',
        'Videos educativos completados por estudiante',
        'Tiempo activo en sesiones dentro de la plataforma',
      ],
      datos_no_registrados: [
        'Trabajos escritos o tareas externas fuera de línea (no existen en la base de datos actual)',
        'Asistencia física presencial en aula (se sustituye por registro de sesiones activas en plataforma)',
      ],
    },
    resumen_general: {
      total_estudiantes: estudiantes.length,
      estudiantes_con_evaluaciones: conEvaluaciones.length,
      estudiantes_en_riesgo: enRiesgo.length,
      promedio_grupo: promedioGrupo,
      tasa_aprobacion_pct: tasaAprobacion,
      cobertura_promedio_pct: coberturaPromedio,
      total_evaluaciones_catalogo: totalEvaluacionesCatalogo,
    },
    comparativa_grados: comparativaGrados,
    estudiantes,
    competencias_saberes: competenciasSaberes,
    saberes_intereses: {
      total_interacciones: totalInteraccionesSaberes,
      nivel_confianza: nivelConfianzaSaberes,
      nota_metodologica:
        'Ordenado de mayor a menor demanda sumando evaluaciones presentadas, videos completados, duelos en línea elegidos y salas virtuales creadas sobre cada saber.',
      datos_faltantes: [
        'Encuestas cualitativas sobre el motivo de elección personal de cada estudiante',
        'Inscripción a asignaturas optativas libres (en A.B.A. los saberes se organizan por grado escolar)',
      ],
      ranking: rankingSaberes,
    },
    alertas,
  };
}

/**
 * Genera el reporte individual privado de un único estudiante, sin incluir
 * identificadores, promedios ni calificaciones de otros compañeros, apto para
 * compartir directamente con el alumno o su familia.
 */
export function getPrivateStudentReport(params: {
  idEstudiante: number;
}): PrivateStudentReport | null {
  const st = db
    .prepare(
      `SELECT est.id_estudiante, est.id_usuario, est.codigo_estudiantil,
              u.nombre, u.apellido, g.nombre_grado, g.seccion
       FROM estudiante est
       JOIN usuario u ON u.id_usuario = est.id_usuario
       JOIN grado g ON g.id_grado = est.id_grado
       WHERE est.id_estudiante = ?`
    )
    .get(params.idEstudiante) as
    | {
        id_estudiante: number;
        id_usuario: number;
        codigo_estudiantil: string | null;
        nombre: string;
        apellido: string;
        nombre_grado: string;
        seccion: string | null;
      }
    | undefined;

  if (!st) return null;

  const totalEvaluacionesCatalogo = (
    db.prepare('SELECT COUNT(*) as total FROM evaluacion').get() as { total: number }
  ).total;
  const totalVideosCatalogo = (
    db.prepare('SELECT COUNT(*) as total FROM video').get() as { total: number }
  ).total;

  const scores = db
    .prepare(
      `SELECT p.id_puntaje, p.id_evaluacion, p.calificacion, p.fecha_realizacion,
              e.titulo as evaluacion_titulo, s.id_saber, s.titulo as saber_titulo
       FROM puntaje p
       JOIN evaluacion e ON e.id_evaluacion = p.id_evaluacion
       JOIN saber s ON s.id_saber = e.id_saber
       WHERE p.id_estudiante = ?
       ORDER BY p.fecha_realizacion ASC, p.id_puntaje ASC`
    )
    .all(st.id_estudiante) as unknown as Array<{
    id_puntaje: number;
    id_evaluacion: number;
    calificacion: number;
    fecha_realizacion: string;
    evaluacion_titulo: string;
    id_saber: number;
    saber_titulo: string;
  }>;

  const videosCompletados = (
    db
      .prepare(
        `SELECT COUNT(*) as total
         FROM movimiento_puntos
         WHERE id_usuario = ? AND fuente = 'video'`
      )
      .get(st.id_usuario) as { total: number }
  ).total;

  const timeStats = db
    .prepare(
      `SELECT COUNT(*) as sesiones, COALESCE(SUM(duracion_activa_ms), 0) as total_ms
       FROM sesion_actividad
       WHERE id_usuario = ?`
    )
    .get(st.id_usuario) as { sesiones: number; total_ms: number };

  const numericScores = scores.map((s) => Number(s.calificacion));
  const avg =
    numericScores.length > 0
      ? Number((numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(2))
      : null;
  const uniqueEvals = new Set(scores.map((s) => s.id_evaluacion)).size;
  const cobertura =
    totalEvaluacionesCatalogo > 0
      ? Number(((uniqueEvals / totalEvaluacionesCatalogo) * 100).toFixed(1))
      : 0;
  const trend = computeTrend(numericScores);
  const nivel = classifyPerformance(avg);

  const saberBuckets = new Map<
    number,
    { id_saber: number; saber_titulo: string; notes: number[] }
  >();
  for (const sc of scores) {
    const b = saberBuckets.get(sc.id_saber) ?? {
      id_saber: sc.id_saber,
      saber_titulo: sc.saber_titulo,
      notes: [],
    };
    b.notes.push(Number(sc.calificacion));
    saberBuckets.set(sc.id_saber, b);
  }

  const desempenoSaberes = Array.from(saberBuckets.values()).map((b) => {
    const sAvg = Number((b.notes.reduce((x, y) => x + y, 0) / b.notes.length).toFixed(2));
    const estado: 'Consolidado' | 'En desarrollo' | 'Requiere refuerzo' =
      sAvg >= CONSOLIDATED_THRESHOLD
        ? 'Consolidado'
        : sAvg >= PASS_THRESHOLD
          ? 'En desarrollo'
          : 'Requiere refuerzo';
    return {
      id_saber: b.id_saber,
      saber_titulo: b.saber_titulo,
      intentos: b.notes.length,
      promedio: sAvg,
      estado,
    };
  });

  const recomendaciones: string[] = [];
  const weakSaberes = desempenoSaberes.filter((s) => s.estado === 'Requiere refuerzo');
  if (weakSaberes.length > 0) {
    recomendaciones.push(
      `Reforzar en casa y aula los saberes: ${weakSaberes.map((s) => s.saber_titulo).join(', ')}.`
    );
  }
  if (trend.caidaSostenida) {
    recomendaciones.push(
      'Se observa una disminución reciente en las calificaciones; se recomienda repasar los videos introductorios antes de presentar nuevas evaluaciones.'
    );
  } else if (trend.tendencia === 'alza') {
    recomendaciones.push(
      'El estudiante muestra una evolución positiva sostenida en sus últimas evaluaciones.'
    );
  }
  if (scores.length === 0) {
    recomendaciones.push(
      'Aún no hay evaluaciones completadas; iniciar con los saberes de su grado y sus videos de apoyo.'
    );
  }
  if (videosCompletados < totalVideosCatalogo && weakSaberes.length > 0) {
    recomendaciones.push(
      `Completar los videos educativos disponibles (${videosCompletados}/${totalVideosCatalogo}) para afianzar los conceptos previos.`
    );
  }
  if (recomendaciones.length === 0) {
    recomendaciones.push(
      'Mantener el ritmo actual de estudio y avanzar hacia las evaluaciones pendientes.'
    );
  }

  return {
    generado_en: new Date().toISOString(),
    aviso_privacidad:
      'Reporte individual privado: contiene únicamente el registro académico del estudiante indicado, sin datos ni comparativas de otros alumnos.',
    estudiante: {
      id_estudiante: st.id_estudiante,
      nombre_completo: `${st.nombre} ${st.apellido}`,
      codigo_estudiantil: st.codigo_estudiantil,
      grado: st.seccion ? `${st.nombre_grado} (${st.seccion})` : st.nombre_grado,
    },
    resumen: {
      promedio_calificacion: avg,
      promedio_porcentaje: avg !== null ? Number((avg * 20).toFixed(1)) : 0,
      evaluaciones_realizadas: scores.length,
      evaluaciones_unicas: uniqueEvals,
      total_evaluaciones_catalogo: totalEvaluacionesCatalogo,
      cobertura_pct: cobertura,
      videos_completados: videosCompletados,
      total_videos_catalogo: totalVideosCatalogo,
      sesiones_activas: Number(timeStats.sesiones ?? 0),
      tiempo_activo_total_ms: Number(timeStats.total_ms ?? 0),
      tendencia: trend.tendencia,
      delta_tendencia: trend.delta,
      nivel_desempeno: nivel,
      caida_sostenida: trend.caidaSostenida,
    },
    evolucion_temporal: scores.map((sc) => ({
      id_puntaje: sc.id_puntaje,
      fecha_realizacion: sc.fecha_realizacion,
      evaluacion_titulo: sc.evaluacion_titulo,
      saber_titulo: sc.saber_titulo,
      calificacion: Number(sc.calificacion),
      porcentaje: Number((Number(sc.calificacion) * 20).toFixed(1)),
      aprobada: Number(sc.calificacion) >= PASS_THRESHOLD,
    })),
    desempeno_saberes: desempenoSaberes,
    recomendaciones,
  };
}
