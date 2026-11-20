import type { SaberItem } from '../types';

export type SaberCategory =
  | 'Matemáticas y Lógica'
  | 'Lenguaje y Lectura'
  | 'Ciencias y Entorno'
  | 'General';

export type SaberCompletionFilter = 'all' | 'pendientes' | 'completados';

export interface SaberSearchHit {
  saber: SaberItem;
  categoria: SaberCategory;
  etiquetas: string[];
  score: number;
  matchType: 'exacto' | 'sinonimo' | 'recurso' | 'aproximado' | 'catalogo';
  matchContext: string | null;
  matchedVideoId: number | null;
  matchedEvaluacionId: number | null;
}

export interface SaberSearchResponse {
  hits: SaberSearchHit[];
  didYouMean: string | null;
  appliedTokens: string[];
  usedFuzzyFallback: boolean;
}

const SPANISH_STOPWORDS = new Set([
  'a',
  'al',
  'algo',
  'con',
  'como',
  'cual',
  'cuales',
  'de',
  'del',
  'el',
  'en',
  'es',
  'esta',
  'este',
  'la',
  'las',
  'lo',
  'los',
  'me',
  'mi',
  'para',
  'por',
  'que',
  'quien',
  'se',
  'sin',
  'sobre',
  'su',
  'sus',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'o',
]);

// Diccionario de sinónimos y términos relacionados del dominio educativo A.B.A.
const SYNONYM_GROUPS: string[][] = [
  ['contar', 'conteo', 'numeros', 'numero', 'cifras', 'digitos', 'cantidad', 'manzanas'],
  ['suma', 'sumas', 'sumar', 'adicion', 'mas', 'aritmetica'],
  ['resta', 'restas', 'restar', 'sustraccion', 'quitar', 'menos', 'aritmetica'],
  ['vocales', 'vocal', 'aeiou', 'sonidos'],
  ['abecedario', 'alfabeto', 'letras', 'consonantes', 'abc'],
  ['silabas', 'silaba', 'palabras', 'lectura', 'lectoescritura', 'mesa'],
  ['figuras', 'geometricas', 'geometria', 'formas', 'circulo', 'cuadrado', 'triangulo', 'esquinas'],
  ['colores', 'color', 'primarios', 'amarillo', 'azul', 'rojo', 'banano'],
  ['animales', 'animal', 'fauna', 'domesticos', 'mascotas', 'perro', 'tigre'],
  ['horas', 'hora', 'reloj', 'tiempo', 'analogo', 'minutero'],
  ['video', 'videos', 'clase', 'capsula'],
  ['evaluacion', 'evaluaciones', 'examen', 'quiz', 'prueba', 'preguntas'],
];

const SYNONYM_LOOKUP = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    const existing = SYNONYM_LOOKUP.get(term) ?? [];
    for (const peer of group) {
      if (peer !== term && !existing.includes(peer)) {
        existing.push(peer);
      }
    }
    SYNONYM_LOOKUP.set(term, existing);
  }
}

export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeQuery(input: string): string[] {
  const norm = normalizeSearchText(input);
  if (!norm) return [];
  const raw = norm.split(' ').filter(Boolean);
  const meaningful = raw.filter((t) => !SPANISH_STOPWORDS.has(t));
  return meaningful.length > 0 ? meaningful : raw;
}

export function inferSaberTaxonomy(saber: SaberItem): {
  categoria: SaberCategory;
  etiquetas: string[];
} {
  const hay = normalizeSearchText(
    `${saber.titulo} ${saber.descripcion ?? ''} ${saber.videos.map((v) => v.titulo).join(' ')}`
  );

  let categoria: SaberCategory = 'General';
  if (
    /(contar|conteo|numer|sumar|sumas|restar|restas|figur|geometr|circul|cuadrad|horas|reloj|aritmet)/.test(
      hay
    )
  ) {
    categoria = 'Matemáticas y Lógica';
  } else if (/(vocal|abecedario|alfabeto|silaba|letra|consonant|lectur|palabr)/.test(hay)) {
    categoria = 'Lenguaje y Lectura';
  } else if (/(animal|color|naturalez|ciencia|planta|cuerpo)/.test(hay)) {
    categoria = 'Ciencias y Entorno';
  }

  const tags = new Set<string>();
  const words = normalizeSearchText(`${saber.titulo} ${saber.descripcion ?? ''}`).split(' ');
  for (const w of words) {
    if (w.length >= 3 && !SPANISH_STOPWORDS.has(w) && w !== 'saber') {
      tags.add(w);
      const syns = SYNONYM_LOOKUP.get(w);
      if (syns) {
        for (const syn of syns.slice(0, 4)) tags.add(syn);
      }
    }
  }

  return {
    categoria,
    etiquetas: Array.from(tags),
  };
}

/**
 * Distancia Damerau-Levenshtein acotada para tolerar errores tipográficos y transposiciones.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const dp: number[][] = Array.from({ length: la + 1 }, () =>
    new Array<number>(lb + 1).fill(0)
  );
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2][j - 2] + cost);
      }
      dp[i][j] = val;
    }
  }
  return dp[la][lb];
}

function tokenMaxTypoDistance(token: string): number {
  if (token.length < 4) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

export function isSaberCompleted(saber: SaberItem): boolean {
  return (
    saber.evaluaciones.length > 0 &&
    saber.evaluaciones.some((ev) => ev.ultimo_puntaje !== null && ev.ultimo_puntaje !== undefined)
  );
}

export function searchSaberesCatalog(params: {
  saberes: SaberItem[];
  query: string;
  idGrado?: number | 'all';
  categoria?: SaberCategory | 'all';
  estado?: SaberCompletionFilter;
}): SaberSearchResponse {
  const { saberes, query, idGrado = 'all', categoria = 'all', estado = 'all' } = params;

  const baseFiltered = saberes.filter((s) => {
    if (idGrado !== 'all' && s.id_grado !== idGrado) return false;
    if (estado === 'completados' && !isSaberCompleted(s)) return false;
    if (estado === 'pendientes' && isSaberCompleted(s)) return false;
    if (categoria !== 'all') {
      const tax = inferSaberTaxonomy(s);
      if (tax.categoria !== categoria) return false;
    }
    return true;
  });

  const normQuery = normalizeSearchText(query);
  const tokens = tokenizeQuery(query);

  if (!normQuery || tokens.length === 0) {
    return {
      hits: baseFiltered.map((s) => {
        const tax = inferSaberTaxonomy(s);
        return {
          saber: s,
          categoria: tax.categoria,
          etiquetas: tax.etiquetas,
          score: 0,
          matchType: 'catalogo',
          matchContext: null,
          matchedVideoId: s.videos[0]?.id_video ?? null,
          matchedEvaluacionId: s.evaluaciones[0]?.id_evaluacion ?? null,
        };
      }),
      didYouMean: null,
      appliedTokens: [],
      usedFuzzyFallback: false,
    };
  }

  // Construir vocabulario del catálogo para sugerencias "Quizás quisiste decir"
  const vocabulary = new Set<string>();
  const directHits: SaberSearchHit[] = [];
  const fuzzyHits: SaberSearchHit[] = [];

  for (const s of baseFiltered) {
    const tax = inferSaberTaxonomy(s);
    const normTitle = normalizeSearchText(s.titulo);
    const normDesc = normalizeSearchText(s.descripcion ?? '');
    const normGrado = normalizeSearchText(`${s.nombre_grado} ${s.seccion ?? ''}`);
    const normTags = tax.etiquetas.join(' ');
    const normVideos = s.videos.map((v) => ({
      id: v.id_video,
      raw: v.titulo,
      norm: normalizeSearchText(v.titulo),
    }));
    const normEvals = s.evaluaciones.map((e) => ({
      id: e.id_evaluacion,
      raw: e.titulo,
      norm: normalizeSearchText(`${e.titulo} ${e.instrucciones ?? ''}`),
    }));
    const normQuestions = (s.preguntas_enunciados ?? []).map((qText) => ({
      raw: qText,
      norm: normalizeSearchText(qText),
    }));

    const fullDocWords = normalizeSearchText(
      `${normTitle} ${normDesc} ${normTags} ${normVideos.map((v) => v.norm).join(' ')} ${normQuestions
        .map((q) => q.norm)
        .join(' ')}`
    )
      .split(' ')
      .filter((w) => w.length >= 4 && !SPANISH_STOPWORDS.has(w));
    for (const w of fullDocWords) vocabulary.add(w);

    let score = 0;
    let matchType: SaberSearchHit['matchType'] = 'exacto';
    let matchContext: string | null = null;
    let matchedVideoId: number | null = s.videos[0]?.id_video ?? null;
    let matchedEvaluacionId: number | null = s.evaluaciones[0]?.id_evaluacion ?? null;
    let matchedTokensCount = 0;

    // Coincidencia de frase completa en título
    if (normTitle === normQuery) {
      score += 120;
      matchContext = 'Coincidencia exacta en título';
    } else if (normTitle.includes(normQuery)) {
      score += 75;
      matchContext = 'Coincide en título del saber';
    }

    for (const token of tokens) {
      let tokenMatched = false;

      if (normTitle.split(' ').some((w) => w === token)) {
        score += 45;
        tokenMatched = true;
      } else if (normTitle.includes(token)) {
        score += 32;
        tokenMatched = true;
      }

      if (normDesc.includes(token)) {
        score += 22;
        if (!matchContext) matchContext = 'Coincide en descripción';
        tokenMatched = true;
      }

      if (normGrado.includes(token)) {
        score += 14;
        if (!matchContext) matchContext = `Grado: ${s.nombre_grado}`;
        tokenMatched = true;
      }

      // Videos asociados
      for (const vid of normVideos) {
        if (vid.norm.includes(token)) {
          score += 20;
          matchedVideoId = vid.id;
          if (!matchContext) matchContext = `Video: ${vid.raw}`;
          if (matchType === 'exacto' && !normTitle.includes(token)) matchType = 'recurso';
          tokenMatched = true;
        }
      }

      // Evaluaciones y preguntas asociadas
      for (const ev of normEvals) {
        if (ev.norm.includes(token)) {
          score += 18;
          matchedEvaluacionId = ev.id;
          if (!matchContext) matchContext = `Evaluación: ${ev.raw}`;
          if (matchType === 'exacto' && !normTitle.includes(token)) matchType = 'recurso';
          tokenMatched = true;
        }
      }

      for (const pq of normQuestions) {
        if (pq.norm.includes(token)) {
          score += 24;
          if (!matchContext) matchContext = `Pregunta relacionada: "${pq.raw}"`;
          if (matchType === 'exacto' && !normTitle.includes(token)) matchType = 'recurso';
          tokenMatched = true;
        }
      }

      // Expansión por sinónimos si no coincidió directamente en título/descripción
      if (!tokenMatched) {
        const synonyms = SYNONYM_LOOKUP.get(token) ?? [];
        for (const syn of synonyms) {
          if (normTitle.includes(syn) || normDesc.includes(syn) || normTags.includes(syn)) {
            score += 24;
            if (!matchContext) matchContext = `Relacionado con "${syn}"`;
            matchType = 'sinonimo';
            tokenMatched = true;
            break;
          }
        }
      }

      if (tokenMatched) {
        matchedTokensCount++;
      }
    }

    if (score > 0 && matchedTokensCount > 0) {
      // Bonus si cubre todos los términos de la consulta
      if (matchedTokensCount === tokens.length && tokens.length > 1) {
        score += 20;
      }
      directHits.push({
        saber: s,
        categoria: tax.categoria,
        etiquetas: tax.etiquetas,
        score,
        matchType,
        matchContext: matchContext ?? 'Coincide en título del saber',
        matchedVideoId,
        matchedEvaluacionId,
      });
      continue;
    }

    // Fallback por tolerancia tipográfica (Damerau-Levenshtein)
    let fuzzyScore = 0;
    let fuzzyWordMatched: string | null = null;
    for (const token of tokens) {
      const maxDist = tokenMaxTypoDistance(token);
      if (maxDist === 0) continue;
      let bestDist = Infinity;
      let bestWord: string | null = null;
      for (const docWord of fullDocWords) {
        if (Math.abs(docWord.length - token.length) > maxDist) continue;
        const d = damerauLevenshtein(token, docWord);
        if (d <= maxDist && d < bestDist) {
          bestDist = d;
          bestWord = docWord;
        }
      }
      if (bestWord !== null) {
        fuzzyScore += bestDist === 1 ? 18 : 11;
        fuzzyWordMatched = bestWord;
      }
    }

    if (fuzzyScore > 0) {
      fuzzyHits.push({
        saber: s,
        categoria: tax.categoria,
        etiquetas: tax.etiquetas,
        score: fuzzyScore,
        matchType: 'aproximado',
        matchContext: fuzzyWordMatched
          ? `Coincidencia aproximada con "${fuzzyWordMatched}"`
          : 'Coincidencia aproximada',
        matchedVideoId,
        matchedEvaluacionId,
      });
    }
  }

  if (directHits.length > 0) {
    directHits.sort((a, b) => b.score - a.score || a.saber.id_saber - b.saber.id_saber);
    return {
      hits: directHits,
      didYouMean: null,
      appliedTokens: tokens,
      usedFuzzyFallback: false,
    };
  }

  // Calcular sugerencia "Quizás quisiste decir..." a partir del vocabulario real
  const correctedTokens: string[] = [];
  let hasCorrection = false;
  for (const token of tokens) {
    const maxDist = Math.max(1, tokenMaxTypoDistance(token));
    let bestWord = token;
    let bestDist = Infinity;
    for (const vocabWord of vocabulary) {
      if (vocabWord === token) {
        bestWord = vocabWord;
        bestDist = 0;
        break;
      }
      if (Math.abs(vocabWord.length - token.length) > maxDist) continue;
      const d = damerauLevenshtein(token, vocabWord);
      if (d <= maxDist && d < bestDist) {
        bestDist = d;
        bestWord = vocabWord;
      }
    }
    if (bestWord !== token) hasCorrection = true;
    correctedTokens.push(bestWord);
  }

  fuzzyHits.sort((a, b) => b.score - a.score || a.saber.id_saber - b.saber.id_saber);

  return {
    hits: fuzzyHits,
    didYouMean: hasCorrection ? correctedTokens.join(' ') : null,
    appliedTokens: tokens,
    usedFuzzyFallback: fuzzyHits.length > 0,
  };
}
