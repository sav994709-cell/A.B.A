import type { VideoItem } from '../types';

export type DidacticTopicKey =
  | 'sumas'
  | 'restas'
  | 'conteo'
  | 'colores'
  | 'figuras'
  | 'reloj'
  | 'vocales'
  | 'abc'
  | 'silabas'
  | 'animales'
  | 'general';

export interface DidacticSceneSpec {
  id: 'contexto' | 'mecanismo' | 'aplicacion';
  stepLabel: string;
  shortTitle: string;
  narration: string;
  causeEffectNote: string;
}

export interface DidacticLessonPlan {
  topicKey: DidacticTopicKey;
  conceptTitle: string;
  centralIdea: string;
  scenes: [DidacticSceneSpec, DidacticSceneSpec, DidacticSceneSpec];
}

export function resolveDidacticTopic(video: Pick<VideoItem, 'id_video' | 'titulo' | 'saber_titulo' | 'url_video'>): DidacticTopicKey {
  const haystack = `${video.titulo} ${video.saber_titulo ?? ''} ${video.url_video}`.toLowerCase();
  if (haystack.includes('suma')) return 'sumas';
  if (haystack.includes('resta')) return 'restas';
  if (haystack.includes('contar') || haystack.includes('número') || haystack.includes('numero') || haystack.includes('num1')) return 'conteo';
  if (haystack.includes('color')) return 'colores';
  if (haystack.includes('figura') || haystack.includes('círculo') || haystack.includes('circulo') || haystack.includes('cuadrado')) return 'figuras';
  if (haystack.includes('reloj') || haystack.includes('hora')) return 'reloj';
  if (haystack.includes('vocal')) return 'vocales';
  if (haystack.includes('abecedario') || haystack.includes('abc') || haystack.includes('consonante')) return 'abc';
  if (haystack.includes('sílaba') || haystack.includes('silaba')) return 'silabas';
  if (haystack.includes('animal')) return 'animales';
  return 'general';
}

const LESSON_PLANS: Record<DidacticTopicKey, DidacticLessonPlan> = {
  sumas: {
    topicKey: 'sumas',
    conceptTitle: 'La suma como unión de dos cantidades',
    centralIdea: 'Sumar no es memorizar un resultado: es reunir dos grupos separados en un solo conjunto total.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Dos grupos independientes',
        narration: 'Partimos de dos cantidades separadas: 3 unidades azules en el Grupo A y 2 unidades ámbar en el Grupo B.',
        causeEffectNote: 'Cada conjunto mantiene su cantidad inicial antes de combinarse.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Unión y conteo continuo',
        narration: 'El signo más (+) acerca ambos grupos hacia una misma zona. Al juntarlos, contamos de forma continua del 1 al 5.',
        causeEffectNote: 'Al reunir los dos grupos, el total crece porque ninguna unidad se pierde.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Equivalencia aplicada',
        narration: 'Así comprobamos visualmente que 3 + 2 = 5 y aplicamos la misma unión al ejemplo 2 + 2 = 4.',
        causeEffectNote: 'Regla visual: cantidad inicial + cantidad añadida = total unificado.',
      },
    ],
  },
  restas: {
    topicKey: 'restas',
    conceptTitle: 'La resta como retiro de unidades',
    centralIdea: 'Restar hace visible cuántas unidades permanecen cuando se separa una parte del grupo inicial.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Colección completa inicial',
        narration: 'Observamos primero el conjunto completo: 5 bloques ordenados en una fila de referencia.',
        causeEffectNote: 'El punto de partida siempre es la cantidad total disponible.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Separación de la parte retirada',
        narration: 'El signo menos (-) señala 2 bloques en coral que salen del grupo principal, dejando su huella vacía.',
        causeEffectNote: 'Retirar unidades reduce el conjunto exactamente en la cantidad separada.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Diferencia restante',
        narration: 'Contamos únicamente los bloques que permanecen dentro del marco: quedan 3. Por eso 5 - 2 = 3.',
        causeEffectNote: 'Total inicial (5) - parte retirada (2) = resto disponible (3).',
      },
    ],
  },
  conteo: {
    topicKey: 'conteo',
    conceptTitle: 'Correspondencia uno a uno en la recta numérica',
    centralIdea: 'Cada número en orden representa exactamente una unidad adicional respecto al anterior.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Cantidad y símbolo',
        narration: 'Un símbolo numérico resume cuántas unidades hay en un grupo. La recta del 1 al 10 ordena esas cantidades.',
        causeEffectNote: 'Avanzar hacia la derecha significa aumentar de uno en uno.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Salto progresivo (+1)',
        narration: 'Por cada unidad nueva que aparece arriba, el marcador avanza un paso exacto en la recta numérica.',
        causeEffectNote: 'Nunca se salta un número ni se cuenta dos veces el mismo elemento.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Lectura directa de conjuntos',
        narration: 'Al contar 3 unidades detenemos la recta en 3; al completar toda la serie llegamos a 10.',
        causeEffectNote: 'El último número nombrado indica el tamaño total del grupo.',
      },
    ],
  },
  colores: {
    topicKey: 'colores',
    conceptTitle: 'Colores primarios y transformación por mezcla',
    centralIdea: 'A partir de tres colores base (amarillo, azul y rojo) se obtienen nuevos tonos al superponerlos.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Los tres colores base',
        narration: 'Amarillo, azul y rojo son colores primarios: no se forman mezclando otros tonos.',
        causeEffectNote: 'Son el punto de partida de toda la paleta cromática.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Superposición controlada',
        narration: 'Al acercar dos círculos primarios, la zona donde coinciden cambia de tono: Amarillo + Azul produce Verde.',
        causeEffectNote: 'Causa: dos primarios se cruzan. Efecto: nace un color secundario.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Relación con objetos reales',
        narration: 'Identificamos las tres mezclas secundarias (Verde, Naranja y Violeta) y asociamos ejemplos claros como el banano amarillo.',
        causeEffectNote: 'Amarillo + Azul = Verde · Amarillo + Rojo = Naranja · Azul + Rojo = Violeta.',
      },
    ],
  },
  figuras: {
    topicKey: 'figuras',
    conceptTitle: 'Lados rectos, vértices y curvatura continua',
    centralIdea: 'La forma de una figura depende de si su borde cambia de dirección en esquinas o gira de forma continua.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Tres figuras fundamentales',
        narration: 'Comparamos el cuadrado, el triángulo y el círculo sobre una cuadrícula de referencia.',
        causeEffectNote: 'Observamos el contorno exterior de cada figura.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Recorrido del borde',
        narration: 'Un punto trazador recorre los 4 lados rectos del cuadrado deteniéndose en sus 4 esquinas, mientras en el círculo gira sin ángulos.',
        causeEffectNote: 'Cada cambio brusco de dirección forma un vértice (esquina).',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Clasificación por criterio',
        narration: 'Separamos figuras con esquinas (cuadrado: 4, triángulo: 3) frente al círculo, que no tiene esquinas.',
        causeEffectNote: 'Sin vértices y curva constante → Círculo.',
      },
    ],
  },
  reloj: {
    topicKey: 'reloj',
    conceptTitle: 'Cómo se coordinan el horario y el minutero',
    centralIdea: 'La manecilla larga marca los minutos y empuja a la manecilla corta exactamente un número por cada vuelta completa.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Dos manecillas con roles distintos',
        narration: 'La manecilla corta (azul) señala la hora; la manecilla larga (esmeralda) señala los minutos en la esfera.',
        causeEffectNote: 'Primero distinguimos longitud y función de cada aguja.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Una vuelta de minutos = 1 hora',
        narration: 'Cuando el minutero recorre los 60 minutos y regresa al 12, el horario pasa del 2 al 3.',
        causeEffectNote: 'Causa: giro completo del minutero. Efecto: avance de 1 hora.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Lectura de horas en punto',
        narration: 'Si el minutero apunta al 12 y el horario al 3, leemos exactamente las 3:00.',
        causeEffectNote: 'Minutero en 12 = :00 minutos (hora en punto).',
      },
    ],
  },
  vocales: {
    topicKey: 'vocales',
    conceptTitle: 'Las cinco vocales como inicio de palabra',
    centralIdea: 'Cada vocal tiene una forma gráfica propia y un sonido abierto que da inicio a palabras conocidas.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Conjunto de cinco vocales',
        narration: 'Presentamos las cinco vocales en orden claro: A, E, I, O, U.',
        causeEffectNote: 'Son la base sonora que acompaña a todas las consonantes.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Conexión letra → palabra',
        narration: 'Destacamos cada vocal en azul para enlazarla con su palabra inicial: A de Avión, E de Estrella, I de Isla.',
        causeEffectNote: 'El cambio de la primera letra modifica por completo el sonido inicial.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Identificación directa',
        narration: 'Completamos la serie con O de Oso y U de Uva, verificando la letra inicial resaltada en cada ejemplo.',
        causeEffectNote: 'Reconocer la vocal inicial facilita leer y escribir palabras nuevas.',
      },
    ],
  },
  abc: {
    topicKey: 'abc',
    conceptTitle: 'Orden secuencial en el abecedario',
    centralIdea: 'Las letras siguen un orden fijo donde cada consonante y vocal ocupa una posición predecible.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'La secuencia ordenada',
        narration: 'El abecedario organiza las letras en fila fija, diferenciando vocales en azul y consonantes en gris pizarra.',
        causeEffectNote: 'El orden permite ubicar cualquier letra por su vecina anterior y siguiente.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Desplazamiento letra por letra',
        narration: 'Seguimos el avance A → B → C → D → E → F, resaltando qué letra sigue inmediatamente después de cada una.',
        causeEffectNote: 'Después de A siempre viene B; después de B, C.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Completar letras faltantes',
        narration: 'Aplicamos el orden para deducir una letra oculta entre dos conocidas: entre A y C se ubica la B.',
        causeEffectNote: 'Secuencia conocida → deducción segura de la letra intermedia.',
      },
    ],
  },
  silabas: {
    topicKey: 'silabas',
    conceptTitle: 'Formación de sílabas directas (Consonante + Vocal)',
    centralIdea: 'Una consonante se une con cada vocal para formar un golpe de voz único que construye palabras.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Piezas separadas: M + vocales',
        narration: 'Observamos la consonante M a la izquierda y las cinco vocales disponibles a la derecha.',
        causeEffectNote: 'Sola, la consonante necesita una vocal para formar sílaba directa.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Fusión en sílabas',
        narration: 'Al unirse M con a, e, i, o, u nacen cinco sílabas directas: Ma, Me, Mi, Mo, Mu.',
        causeEffectNote: 'Cambiar solo la vocal cambia toda la sílaba resultante.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Construcción de palabra',
        narration: 'Seleccionamos "Me" y la unimos con "sa" para formar la palabra completa: Mesa.',
        causeEffectNote: 'Me + sa = Mesa.',
      },
    ],
  },
  animales: {
    topicKey: 'animales',
    conceptTitle: 'Criterios para distinguir animales domésticos y silvestres',
    centralIdea: 'Un animal doméstico convive y depende del cuidado humano en el hogar, a diferencia del animal silvestre.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Dos entornos posibles',
        narration: 'Dividimos el tablero en dos entornos claros: Hogar / Cuidado humano y Hábitat natural libre.',
        causeEffectNote: 'La clasificación se basa en dónde viven y cómo se cuidan.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Evaluación de ejemplos',
        narration: 'El perro y el gato se desplazan hacia la zona de Hogar; el tigre y el tiburón hacia Selva / Océano.',
        causeEffectNote: 'Entorno natural sin tutela humana → Animal silvestre.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Resumen comparativo',
        narration: 'Confirmamos el contraste directo: Perro (Doméstico) frente a Tigre y Tiburón (Silvestres).',
        causeEffectNote: 'Criterio observable: convivencia en el hogar vs. vida silvestre.',
      },
    ],
  },
  general: {
    topicKey: 'general',
    conceptTitle: 'Comprensión progresiva del concepto',
    centralIdea: 'Descomponemos el tema en contexto, mecanismo de cambio y aplicación concreta.',
    scenes: [
      {
        id: 'contexto',
        stepLabel: '01. Contexto',
        shortTitle: 'Situación inicial',
        narration: 'Ubicamos los elementos principales del saber y sus relaciones antes de introducir cambios.',
        causeEffectNote: 'Identificar qué elementos intervienen primero.',
      },
      {
        id: 'mecanismo',
        stepLabel: '02. Cómo cambia',
        shortTitle: 'Relación causa y efecto',
        narration: 'Observamos paso a paso cómo la transformación de un elemento produce un resultado visible.',
        causeEffectNote: 'Cada cambio en el sistema tiene una consecuencia medible.',
      },
      {
        id: 'aplicacion',
        stepLabel: '03. Resultado',
        shortTitle: 'Aplicación práctica',
        narration: 'Consolidamos el resultado obtenido para resolver con seguridad la evaluación del saber.',
        causeEffectNote: 'Principio comprendido → listo para aplicar en ejercicios.',
      },
    ],
  },
};

export function getLessonPlanForVideo(
  video: Pick<VideoItem, 'id_video' | 'titulo' | 'saber_titulo' | 'url_video'>
): DidacticLessonPlan {
  const key = resolveDidacticTopic(video);
  const base = LESSON_PLANS[key];
  if (key !== 'general') return base;
  return {
    ...base,
    conceptTitle: video.saber_titulo || video.titulo,
  };
}

export interface TimelineSegment {
  sceneIndex: 0 | 1 | 2;
  scene: DidacticSceneSpec;
  sceneProgress: number; // 0..1 dentro de la escena actual
  overallProgress: number; // 0..1 del video completo
}

export function computeTimelineSegment(
  plan: DidacticLessonPlan,
  elapsedSeconds: number,
  totalDurationSeconds: number
): TimelineSegment {
  const safeTotal = Math.max(1, totalDurationSeconds);
  const clampedElapsed = Math.max(0, Math.min(safeTotal, elapsedSeconds));
  const overallProgress = clampedElapsed / safeTotal;
  const rawSegment = overallProgress * 3;
  const sceneIndex = Math.min(2, Math.floor(rawSegment)) as 0 | 1 | 2;
  const segmentStart = sceneIndex / 3;
  const segmentSpan = 1 / 3;
  const sceneProgress = Math.max(0, Math.min(1, (overallProgress - segmentStart) / segmentSpan));

  return {
    sceneIndex,
    scene: plan.scenes[sceneIndex],
    sceneProgress,
    overallProgress,
  };
}
