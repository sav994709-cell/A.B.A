import { db } from './db.ts';

export type SurveyQuestionType = 'opcion_unica' | 'opcion_multiple' | 'escala' | 'texto_libre';

const VALID_QUESTION_TYPES = new Set<SurveyQuestionType>([
  'opcion_unica',
  'opcion_multiple',
  'escala',
  'texto_libre',
]);

const UTC_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const UTC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CreateSurveyOptionInput {
  clave: string;
  etiqueta: string;
}

export interface CreateSurveyQuestionInput {
  clave: string;
  enunciado: string;
  tipo: SurveyQuestionType;
  obligatoria?: boolean;
  escala_min?: number | null;
  escala_max?: number | null;
  opciones?: CreateSurveyOptionInput[];
}

export interface CreateSurveyDefinitionInput {
  codigo: string;
  titulo: string;
  descripcion?: string | null;
  activa?: boolean;
  preguntas: CreateSurveyQuestionInput[];
}

export interface SurveyAnswerInput {
  id_pregunta?: number;
  clave_pregunta?: string;
  opcion_clave?: string;
  opciones_clave?: string[];
  valor_numerico?: number;
  valor_texto?: string;
}

export interface SubmitSurveyResponsesInput {
  idEncuestaDef: number;
  idUsuario: number;
  respuestas: SurveyAnswerInput[];
  enviadoEnUtc?: string;
}

export interface SurveyReportFilters {
  desde?: string;
  hasta?: string;
  tipo?: SurveyQuestionType;
}

interface QuestionRow {
  id_pregunta: number;
  id_encuesta_def: number;
  orden: number;
  clave: string;
  enunciado: string;
  tipo: SurveyQuestionType;
  obligatoria: number;
  escala_min: number | null;
  escala_max: number | null;
}

interface OptionRow {
  id_opcion: number;
  id_pregunta: number;
  orden: number;
  clave: string;
  etiqueta: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeKey(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 80) : '';
}

function normalizeIsoUtc(raw?: string): { ok: true; iso: string; utcDate: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') {
    const iso = new Date().toISOString();
    return { ok: true, iso, utcDate: iso.slice(0, 10) };
  }
  if (typeof raw !== 'string' || !UTC_ISO_RE.test(raw.trim())) {
    return { ok: false, error: 'enviado_en_utc debe ser una marca ISO-8601 UTC válida terminada en Z.' };
  }
  const trimmed = raw.trim();
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: 'enviado_en_utc contiene una fecha inválida.' };
  }
  const iso = new Date(parsed).toISOString();
  return { ok: true, iso, utcDate: iso.slice(0, 10) };
}

export function listSurveyDefinitions() {
  return db
    .prepare(
      `SELECT d.id_encuesta_def, d.codigo, d.titulo, d.descripcion, d.activa, d.creada_en_utc,
              COUNT(DISTINCT p.id_pregunta) AS total_preguntas,
              COUNT(DISTINCT e.id_envio) AS total_envios
       FROM encuesta_definicion d
       LEFT JOIN encuesta_pregunta p ON p.id_encuesta_def = d.id_encuesta_def
       LEFT JOIN encuesta_envio e ON e.id_encuesta_def = d.id_encuesta_def
       GROUP BY d.id_encuesta_def
       ORDER BY d.id_encuesta_def ASC`
    )
    .all();
}

export function getSurveyDefinitionById(idEncuestaDef: number, idUsuario?: number) {
  const def = db
    .prepare(
      `SELECT id_encuesta_def, codigo, titulo, descripcion, activa, creada_en_utc
       FROM encuesta_definicion
       WHERE id_encuesta_def = ?`
    )
    .get(idEncuestaDef) as
    | {
        id_encuesta_def: number;
        codigo: string;
        titulo: string;
        descripcion: string | null;
        activa: number;
        creada_en_utc: string;
      }
    | undefined;

  if (!def) return null;

  const questions = db
    .prepare(
      `SELECT id_pregunta, id_encuesta_def, orden, clave, enunciado, tipo, obligatoria, escala_min, escala_max
       FROM encuesta_pregunta
       WHERE id_encuesta_def = ?
       ORDER BY orden ASC`
    )
    .all(idEncuestaDef) as unknown as QuestionRow[];

  const options = db
    .prepare(
      `SELECT o.id_opcion, o.id_pregunta, o.orden, o.clave, o.etiqueta
       FROM encuesta_opcion o
       JOIN encuesta_pregunta p ON p.id_pregunta = o.id_pregunta
       WHERE p.id_encuesta_def = ?
       ORDER BY o.id_pregunta ASC, o.orden ASC`
    )
    .all(idEncuestaDef) as unknown as OptionRow[];

  const optsByQuestion = new Map<number, OptionRow[]>();
  for (const opt of options) {
    const arr = optsByQuestion.get(opt.id_pregunta) ?? [];
    arr.push(opt);
    optsByQuestion.set(opt.id_pregunta, arr);
  }

  let miParticipacion: { ya_respondio: boolean; enviado_en_utc: string | null } | undefined;
  if (typeof idUsuario === 'number' && Number.isInteger(idUsuario) && idUsuario > 0) {
    const envio = db
      .prepare('SELECT enviado_en_utc FROM encuesta_envio WHERE id_encuesta_def = ? AND id_usuario = ?')
      .get(idEncuestaDef, idUsuario) as { enviado_en_utc: string } | undefined;
    miParticipacion = {
      ya_respondio: Boolean(envio),
      enviado_en_utc: envio?.enviado_en_utc ?? null,
    };
  }

  return {
    ...def,
    activa: def.activa === 1,
    ...(miParticipacion ? { mi_participacion: miParticipacion } : {}),
    preguntas: questions.map((q) => ({
      ...q,
      obligatoria: q.obligatoria === 1,
      opciones: optsByQuestion.get(q.id_pregunta) ?? [],
    })),
  };
}

export function createSurveyDefinition(input: CreateSurveyDefinitionInput):
  | { ok: true; survey: NonNullable<ReturnType<typeof getSurveyDefinitionById>> }
  | { ok: false; status: number; error: string } {
  const codigo = normalizeKey(input.codigo);
  const titulo = typeof input.titulo === 'string' ? input.titulo.trim().slice(0, 200) : '';
  const descripcion =
    typeof input.descripcion === 'string' && input.descripcion.trim().length > 0
      ? input.descripcion.trim().slice(0, 1000)
      : null;
  const activa = input.activa === false ? 0 : 1;

  if (!codigo) {
    return { ok: false, status: 400, error: 'El código de la encuesta es obligatorio.' };
  }
  if (!titulo) {
    return { ok: false, status: 400, error: 'El título de la encuesta es obligatorio.' };
  }
  if (!Array.isArray(input.preguntas) || input.preguntas.length === 0) {
    return { ok: false, status: 400, error: 'La encuesta debe incluir al menos una pregunta.' };
  }

  const seenQuestionKeys = new Set<string>();
  const normalizedQuestions: Array<{
    clave: string;
    enunciado: string;
    tipo: SurveyQuestionType;
    obligatoria: number;
    escalaMin: number | null;
    escalaMax: number | null;
    opciones: Array<{ clave: string; etiqueta: string }>;
  }> = [];

  for (let i = 0; i < input.preguntas.length; i++) {
    const rawQ = input.preguntas[i];
    const clave = normalizeKey(rawQ?.clave);
    const enunciado = typeof rawQ?.enunciado === 'string' ? rawQ.enunciado.trim().slice(0, 500) : '';
    const tipo = rawQ?.tipo;

    if (!clave || !enunciado || !VALID_QUESTION_TYPES.has(tipo)) {
      return {
        ok: false,
        status: 400,
        error: `La pregunta #${i + 1} requiere clave, enunciado y tipo válido (opcion_unica, opcion_multiple, escala o texto_libre).`,
      };
    }
    if (seenQuestionKeys.has(clave)) {
      return { ok: false, status: 400, error: `Clave de pregunta duplicada: "${clave}".` };
    }
    seenQuestionKeys.add(clave);

    const obligatoria = rawQ.obligatoria === false ? 0 : 1;
    let escalaMin: number | null = null;
    let escalaMax: number | null = null;
    const normalizedOpts: Array<{ clave: string; etiqueta: string }> = [];

    if (tipo === 'opcion_unica' || tipo === 'opcion_multiple') {
      if (!Array.isArray(rawQ.opciones) || rawQ.opciones.length < 2) {
        return {
          ok: false,
          status: 400,
          error: `La pregunta "${clave}" de selección debe tener al menos 2 opciones.`,
        };
      }
      const seenOptKeys = new Set<string>();
      for (const opt of rawQ.opciones) {
        const optClave = normalizeKey(opt?.clave);
        const optEtiqueta =
          typeof opt?.etiqueta === 'string' ? opt.etiqueta.trim().slice(0, 200) : '';
        if (!optClave || !optEtiqueta) {
          return {
            ok: false,
            status: 400,
            error: `Todas las opciones de "${clave}" requieren clave y etiqueta.`,
          };
        }
        if (seenOptKeys.has(optClave)) {
          return {
            ok: false,
            status: 400,
            error: `Opción duplicada "${optClave}" en la pregunta "${clave}".`,
          };
        }
        seenOptKeys.add(optClave);
        normalizedOpts.push({ clave: optClave, etiqueta: optEtiqueta });
      }
    } else if (tipo === 'escala') {
      const min = rawQ.escala_min ?? 1;
      const max = rawQ.escala_max ?? 5;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max || max - min > 20) {
        return {
          ok: false,
          status: 400,
          error: `La pregunta de escala "${clave}" requiere límites enteros válidos con escala_min < escala_max.`,
        };
      }
      escalaMin = min;
      escalaMax = max;
    }

    normalizedQuestions.push({
      clave,
      enunciado,
      tipo,
      obligatoria,
      escalaMin,
      escalaMax,
      opciones: normalizedOpts,
    });
  }

  const nowIso = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const defRes = db
      .prepare(
        `INSERT INTO encuesta_definicion (codigo, titulo, descripcion, activa, creada_en_utc)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(codigo, titulo, descripcion, activa, nowIso);
    const idEncuestaDef = Number(defRes.lastInsertRowid);

    const insertPreg = db.prepare(
      `INSERT INTO encuesta_pregunta (id_encuesta_def, orden, clave, enunciado, tipo, obligatoria, escala_min, escala_max)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertOpt = db.prepare(
      `INSERT INTO encuesta_opcion (id_pregunta, orden, clave, etiqueta)
       VALUES (?, ?, ?, ?)`
    );

    for (let i = 0; i < normalizedQuestions.length; i++) {
      const q = normalizedQuestions[i];
      const qRes = insertPreg.run(
        idEncuestaDef,
        i + 1,
        q.clave,
        q.enunciado,
        q.tipo,
        q.obligatoria,
        q.escalaMin,
        q.escalaMax
      );
      const idPregunta = Number(qRes.lastInsertRowid);
      for (let j = 0; j < q.opciones.length; j++) {
        insertOpt.run(idPregunta, j + 1, q.opciones[j].clave, q.opciones[j].etiqueta);
      }
    }

    db.exec('COMMIT;');
    const created = getSurveyDefinitionById(idEncuestaDef)!;
    return { ok: true, survey: created };
  } catch (err: unknown) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
      return { ok: false, status: 409, error: `Ya existe una encuesta con el código "${codigo}".` };
    }
    throw err;
  }
}

export function submitSurveyResponses(input: SubmitSurveyResponsesInput):
  | {
      ok: true;
      envio: {
        id_envio: number;
        id_encuesta_def: number;
        id_usuario: number;
        enviado_en_utc: string;
        utc_date: string;
        total_registros_guardados: number;
      };
    }
  | { ok: false; status: number; code?: string; enviado_en_utc?: string; error: string } {
  const survey = db
    .prepare('SELECT id_encuesta_def, activa FROM encuesta_definicion WHERE id_encuesta_def = ?')
    .get(input.idEncuestaDef) as { id_encuesta_def: number; activa: number } | undefined;

  if (!survey) {
    return { ok: false, status: 404, error: 'Encuesta no encontrada.' };
  }
  if (survey.activa !== 1) {
    return { ok: false, status: 409, error: 'La encuesta se encuentra cerrada y no admite nuevas respuestas.' };
  }

  const userExists = db
    .prepare('SELECT id_usuario FROM usuario WHERE id_usuario = ?')
    .get(input.idUsuario);
  if (!userExists) {
    return { ok: false, status: 404, error: 'Participante no encontrado.' };
  }

  const tsCheck = normalizeIsoUtc(input.enviadoEnUtc);
  if (!tsCheck.ok) {
    return { ok: false, status: 400, error: tsCheck.error };
  }

  if (!Array.isArray(input.respuestas) || input.respuestas.length === 0) {
    return { ok: false, status: 400, error: 'Debes incluir las respuestas de la encuesta.' };
  }

  const existingSubmission = db
    .prepare(
      'SELECT id_envio, enviado_en_utc FROM encuesta_envio WHERE id_encuesta_def = ? AND id_usuario = ?'
    )
    .get(input.idEncuestaDef, input.idUsuario) as
    | { id_envio: number; enviado_en_utc: string }
    | undefined;
  if (existingSubmission) {
    return {
      ok: false,
      status: 409,
      code: 'ENCUESTA_YA_RESPONDIDA',
      enviado_en_utc: existingSubmission.enviado_en_utc,
      error: 'Ya registraste tu respuesta para esta encuesta. Solo se permite una participación por usuario.',
    };
  }

  const questions = db
    .prepare(
      `SELECT id_pregunta, id_encuesta_def, orden, clave, enunciado, tipo, obligatoria, escala_min, escala_max
       FROM encuesta_pregunta
       WHERE id_encuesta_def = ?
       ORDER BY orden ASC`
    )
    .all(input.idEncuestaDef) as unknown as QuestionRow[];

  const options = db
    .prepare(
      `SELECT o.id_opcion, o.id_pregunta, o.orden, o.clave, o.etiqueta
       FROM encuesta_opcion o
       JOIN encuesta_pregunta p ON p.id_pregunta = o.id_pregunta
       WHERE p.id_encuesta_def = ?`
    )
    .all(input.idEncuestaDef) as unknown as OptionRow[];

  const questionById = new Map<number, QuestionRow>();
  const questionByClave = new Map<string, QuestionRow>();
  for (const q of questions) {
    questionById.set(q.id_pregunta, q);
    questionByClave.set(q.clave, q);
  }

  const optionsByQuestion = new Map<number, Map<string, OptionRow>>();
  for (const o of options) {
    let qMap = optionsByQuestion.get(o.id_pregunta);
    if (!qMap) {
      qMap = new Map<string, OptionRow>();
      optionsByQuestion.set(o.id_pregunta, qMap);
    }
    qMap.set(o.clave, o);
  }

  const seenQuestions = new Set<number>();
  const rowsToInsert: Array<{
    idPregunta: number;
    tipo: SurveyQuestionType;
    idOpcion: number | null;
    valorNumerico: number | null;
    valorTexto: string | null;
  }> = [];

  for (const item of input.respuestas) {
    let q: QuestionRow | undefined;
    if (item?.id_pregunta !== undefined && item?.id_pregunta !== null) {
      q = questionById.get(Number(item.id_pregunta));
    } else if (typeof item?.clave_pregunta === 'string') {
      q = questionByClave.get(item.clave_pregunta.trim());
    }

    if (!q) {
      return {
        ok: false,
        status: 400,
        error: 'Se incluyó una pregunta que no pertenece a esta encuesta.',
      };
    }

    if (seenQuestions.has(q.id_pregunta)) {
      return {
        ok: false,
        status: 400,
        error: `La pregunta "${q.clave}" aparece repetida en el envío.`,
      };
    }
    seenQuestions.add(q.id_pregunta);

    if (q.tipo === 'opcion_unica') {
      const optClave = typeof item.opcion_clave === 'string' ? item.opcion_clave.trim() : '';
      if (!optClave) {
        if (q.obligatoria === 1) {
          return { ok: false, status: 400, error: `La pregunta "${q.clave}" requiere una opción.` };
        }
        continue;
      }
      const opt = optionsByQuestion.get(q.id_pregunta)?.get(optClave);
      if (!opt) {
        return {
          ok: false,
          status: 400,
          error: `La opción "${optClave}" no pertenece a la pregunta "${q.clave}".`,
        };
      }
      rowsToInsert.push({
        idPregunta: q.id_pregunta,
        tipo: q.tipo,
        idOpcion: opt.id_opcion,
        valorNumerico: null,
        valorTexto: null,
      });
    } else if (q.tipo === 'opcion_multiple') {
      const rawSelected = Array.isArray(item.opciones_clave) ? item.opciones_clave : [];
      if (rawSelected.length === 0) {
        if (q.obligatoria === 1) {
          return {
            ok: false,
            status: 400,
            error: `La pregunta "${q.clave}" requiere al menos una opción seleccionada.`,
          };
        }
        continue;
      }
      const qOpts = optionsByQuestion.get(q.id_pregunta);
      const uniqueSelected = new Set<string>();
      for (const rawOpt of rawSelected) {
        const optClave = typeof rawOpt === 'string' ? rawOpt.trim() : '';
        if (!optClave || uniqueSelected.has(optClave)) {
          return {
            ok: false,
            status: 400,
            error: `Selección múltiple inválida o duplicada en la pregunta "${q.clave}".`,
          };
        }
        const opt = qOpts?.get(optClave);
        if (!opt) {
          return {
            ok: false,
            status: 400,
            error: `La opción "${optClave}" no pertenece a la pregunta "${q.clave}".`,
          };
        }
        uniqueSelected.add(optClave);
        rowsToInsert.push({
          idPregunta: q.id_pregunta,
          tipo: q.tipo,
          idOpcion: opt.id_opcion,
          valorNumerico: null,
          valorTexto: null,
        });
      }
    } else if (q.tipo === 'escala') {
      if (item.valor_numerico === undefined || item.valor_numerico === null) {
        if (q.obligatoria === 1) {
          return { ok: false, status: 400, error: `La pregunta "${q.clave}" requiere un valor de escala.` };
        }
        continue;
      }
      const val = Number(item.valor_numerico);
      const min = q.escala_min ?? 1;
      const max = q.escala_max ?? 5;
      if (!Number.isInteger(val) || val < min || val > max) {
        return {
          ok: false,
          status: 400,
          error: `El valor para "${q.clave}" debe ser un entero entre ${min} y ${max}.`,
        };
      }
      rowsToInsert.push({
        idPregunta: q.id_pregunta,
        tipo: q.tipo,
        idOpcion: null,
        valorNumerico: val,
        valorTexto: null,
      });
    } else if (q.tipo === 'texto_libre') {
      const text = typeof item.valor_texto === 'string' ? item.valor_texto.trim().slice(0, 2000) : '';
      if (!text) {
        if (q.obligatoria === 1) {
          return { ok: false, status: 400, error: `La pregunta "${q.clave}" requiere un texto de respuesta.` };
        }
        continue;
      }
      rowsToInsert.push({
        idPregunta: q.id_pregunta,
        tipo: q.tipo,
        idOpcion: null,
        valorNumerico: null,
        valorTexto: text,
      });
    }
  }

  for (const q of questions) {
    if (q.obligatoria === 1) {
      const hasRow = rowsToInsert.some((r) => r.idPregunta === q.id_pregunta);
      if (!hasRow) {
        return {
          ok: false,
          status: 400,
          error: `Falta responder la pregunta obligatoria "${q.clave}".`,
        };
      }
    }
  }

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const envioRes = db
      .prepare(
        `INSERT INTO encuesta_envio (id_encuesta_def, id_usuario, enviado_en_utc, utc_date)
         VALUES (?, ?, ?, ?)`
      )
      .run(input.idEncuestaDef, input.idUsuario, tsCheck.iso, tsCheck.utcDate);
    const idEnvio = Number(envioRes.lastInsertRowid);

    const insertResp = db.prepare(
      `INSERT INTO encuesta_respuesta (
         id_envio, id_encuesta_def, id_pregunta, tipo_pregunta,
         id_opcion, valor_numerico, valor_texto, utc_date, creado_en_utc
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const row of rowsToInsert) {
      insertResp.run(
        idEnvio,
        input.idEncuestaDef,
        row.idPregunta,
        row.tipo,
        row.idOpcion,
        row.valorNumerico,
        row.valorTexto,
        tsCheck.utcDate,
        tsCheck.iso
      );
    }

    db.exec('COMMIT;');
    return {
      ok: true,
      envio: {
        id_envio: idEnvio,
        id_encuesta_def: input.idEncuestaDef,
        id_usuario: input.idUsuario,
        enviado_en_utc: tsCheck.iso,
        utc_date: tsCheck.utcDate,
        total_registros_guardados: rowsToInsert.length,
      },
    };
  } catch (err: unknown) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed') || msg.includes('SQLITE_CONSTRAINT_UNIQUE')) {
      const existing = db
        .prepare('SELECT enviado_en_utc FROM encuesta_envio WHERE id_encuesta_def = ? AND id_usuario = ?')
        .get(input.idEncuestaDef, input.idUsuario) as { enviado_en_utc: string } | undefined;
      return {
        ok: false,
        status: 409,
        code: 'ENCUESTA_YA_RESPONDIDA',
        ...(existing ? { enviado_en_utc: existing.enviado_en_utc } : {}),
        error: 'Ya registraste tu respuesta para esta encuesta. Solo se permite una participación por usuario.',
      };
    }
    throw err;
  }
}

export function getSurveyStatisticalReport(
  idEncuestaDef: number,
  filters: SurveyReportFilters = {}
):
  | {
      ok: true;
      reporte: {
        encuesta: {
          id_encuesta_def: number;
          codigo: string;
          titulo: string;
          descripcion: string | null;
          activa: boolean;
        };
        filtros: {
          desde: string | null;
          hasta: string | null;
          tipo: SurveyQuestionType | null;
        };
        resumen: {
          total_envios: number;
          participantes_unicos: number;
          primera_respuesta_utc: string | null;
          ultima_respuesta_utc: string | null;
          serie_diaria: Array<{ utc_date: string; envios: number }>;
        };
        preguntas: Array<Record<string, unknown>>;
      };
    }
  | { ok: false; status: number; error: string } {
  const desde = filters.desde?.trim() || null;
  const hasta = filters.hasta?.trim() || null;
  const tipo = filters.tipo || null;

  if (desde && !UTC_DATE_RE.test(desde)) {
    return { ok: false, status: 400, error: 'El parámetro desde debe usar formato YYYY-MM-DD.' };
  }
  if (hasta && !UTC_DATE_RE.test(hasta)) {
    return { ok: false, status: 400, error: 'El parámetro hasta debe usar formato YYYY-MM-DD.' };
  }
  if (desde && hasta && desde > hasta) {
    return { ok: false, status: 400, error: 'La fecha desde no puede ser posterior a hasta.' };
  }
  if (tipo && !VALID_QUESTION_TYPES.has(tipo)) {
    return {
      ok: false,
      status: 400,
      error: 'El filtro tipo debe ser opcion_unica, opcion_multiple, escala o texto_libre.',
    };
  }

  const def = db
    .prepare(
      `SELECT id_encuesta_def, codigo, titulo, descripcion, activa
       FROM encuesta_definicion
       WHERE id_encuesta_def = ?`
    )
    .get(idEncuestaDef) as
    | {
        id_encuesta_def: number;
        codigo: string;
        titulo: string;
        descripcion: string | null;
        activa: number;
      }
    | undefined;

  if (!def) {
    return { ok: false, status: 404, error: 'Encuesta no encontrada.' };
  }

  const envioDateClauses: string[] = ['id_encuesta_def = ?'];
  const envioParams: Array<string | number> = [idEncuestaDef];
  if (desde) {
    envioDateClauses.push('utc_date >= ?');
    envioParams.push(desde);
  }
  if (hasta) {
    envioDateClauses.push('utc_date <= ?');
    envioParams.push(hasta);
  }
  const envioWhere = envioDateClauses.join(' AND ');

  const summary = db
    .prepare(
      `SELECT COUNT(*) AS total_envios,
              COUNT(DISTINCT id_usuario) AS participantes_unicos,
              MIN(enviado_en_utc) AS primera_respuesta_utc,
              MAX(enviado_en_utc) AS ultima_respuesta_utc
       FROM encuesta_envio
       WHERE ${envioWhere}`
    )
    .get(...envioParams) as {
    total_envios: number;
    participantes_unicos: number;
    primera_respuesta_utc: string | null;
    ultima_respuesta_utc: string | null;
  };

  const serieDiaria = db
    .prepare(
      `SELECT utc_date, COUNT(*) AS envios
       FROM encuesta_envio
       WHERE ${envioWhere}
       GROUP BY utc_date
       ORDER BY utc_date ASC`
    )
    .all(...envioParams) as Array<{ utc_date: string; envios: number }>;

  const qClauses = ['id_encuesta_def = ?'];
  const qParams: Array<string | number> = [idEncuestaDef];
  if (tipo) {
    qClauses.push('tipo = ?');
    qParams.push(tipo);
  }
  const questions = db
    .prepare(
      `SELECT id_pregunta, id_encuesta_def, orden, clave, enunciado, tipo, obligatoria, escala_min, escala_max
       FROM encuesta_pregunta
       WHERE ${qClauses.join(' AND ')}
       ORDER BY orden ASC`
    )
    .all(...qParams) as unknown as QuestionRow[];

  const respDateSql =
    (desde ? ' AND r.utc_date >= ?' : '') + (hasta ? ' AND r.utc_date <= ?' : '');
  const respDateParams: string[] = [
    ...(desde ? [desde] : []),
    ...(hasta ? [hasta] : []),
  ];

  const preguntasReporte: Array<Record<string, unknown>> = [];

  for (const q of questions) {
    if (q.tipo === 'opcion_unica' || q.tipo === 'opcion_multiple') {
      const totals = db
        .prepare(
          `SELECT COUNT(DISTINCT r.id_envio) AS total_encuestados,
                  COUNT(r.id_respuesta) AS total_selecciones
           FROM encuesta_respuesta r
           WHERE r.id_encuesta_def = ? AND r.id_pregunta = ?${respDateSql}`
        )
        .get(idEncuestaDef, q.id_pregunta, ...respDateParams) as {
        total_encuestados: number;
        total_selecciones: number;
      };

      const optionCounts = db
        .prepare(
          `SELECT o.id_opcion, o.clave, o.etiqueta, o.orden,
                  COUNT(r.id_respuesta) AS conteo
           FROM encuesta_opcion o
           LEFT JOIN encuesta_respuesta r
             ON r.id_opcion = o.id_opcion
            AND r.id_pregunta = o.id_pregunta
            AND r.id_encuesta_def = ?${respDateSql}
           WHERE o.id_pregunta = ?
           GROUP BY o.id_opcion
           ORDER BY o.orden ASC`
        )
        .all(idEncuestaDef, ...respDateParams, q.id_pregunta) as Array<{
        id_opcion: number;
        clave: string;
        etiqueta: string;
        orden: number;
        conteo: number;
      }>;

      const opciones = optionCounts.map((o) => {
        const pctEncuestados =
          totals.total_encuestados > 0 ? round2((o.conteo / totals.total_encuestados) * 100) : 0;
        const pctSelecciones =
          totals.total_selecciones > 0 ? round2((o.conteo / totals.total_selecciones) * 100) : 0;
        return {
          id_opcion: o.id_opcion,
          clave: o.clave,
          etiqueta: o.etiqueta,
          conteo: o.conteo,
          porcentaje: q.tipo === 'opcion_unica' ? pctEncuestados : pctEncuestados,
          porcentaje_sobre_encuestados: pctEncuestados,
          porcentaje_sobre_selecciones: pctSelecciones,
        };
      });

      preguntasReporte.push({
        id_pregunta: q.id_pregunta,
        orden: q.orden,
        clave: q.clave,
        enunciado: q.enunciado,
        tipo: q.tipo,
        obligatoria: q.obligatoria === 1,
        total_encuestados: totals.total_encuestados,
        total_selecciones: totals.total_selecciones,
        opciones,
      });
    } else if (q.tipo === 'escala') {
      const scaleStats = db
        .prepare(
          `SELECT COUNT(r.id_respuesta) AS total_respuestas,
                  ROUND(AVG(r.valor_numerico), 2) AS promedio,
                  MIN(r.valor_numerico) AS minimo,
                  MAX(r.valor_numerico) AS maximo
           FROM encuesta_respuesta r
           WHERE r.id_encuesta_def = ? AND r.id_pregunta = ?${respDateSql}`
        )
        .get(idEncuestaDef, q.id_pregunta, ...respDateParams) as {
        total_respuestas: number;
        promedio: number | null;
        minimo: number | null;
        maximo: number | null;
      };

      const rawBuckets = db
        .prepare(
          `SELECT r.valor_numerico AS valor, COUNT(*) AS conteo
           FROM encuesta_respuesta r
           WHERE r.id_encuesta_def = ? AND r.id_pregunta = ?${respDateSql}
           GROUP BY r.valor_numerico
           ORDER BY r.valor_numerico ASC`
        )
        .all(idEncuestaDef, q.id_pregunta, ...respDateParams) as Array<{
        valor: number;
        conteo: number;
      }>;

      const bucketMap = new Map<number, number>(rawBuckets.map((b) => [b.valor, b.conteo]));
      const min = q.escala_min ?? 1;
      const max = q.escala_max ?? 5;
      const distribucion: Array<{ valor: number; conteo: number; porcentaje: number }> = [];
      for (let v = min; v <= max; v++) {
        const conteo = bucketMap.get(v) ?? 0;
        const porcentaje =
          scaleStats.total_respuestas > 0
            ? round2((conteo / scaleStats.total_respuestas) * 100)
            : 0;
        distribucion.push({ valor: v, conteo, porcentaje });
      }

      preguntasReporte.push({
        id_pregunta: q.id_pregunta,
        orden: q.orden,
        clave: q.clave,
        enunciado: q.enunciado,
        tipo: q.tipo,
        obligatoria: q.obligatoria === 1,
        escala_min: min,
        escala_max: max,
        total_respuestas: scaleStats.total_respuestas,
        promedio: scaleStats.promedio,
        minimo: scaleStats.minimo,
        maximo: scaleStats.maximo,
        distribucion,
      });
    } else if (q.tipo === 'texto_libre') {
      const textRows = db
        .prepare(
          `SELECT r.id_respuesta, r.valor_texto, r.utc_date, e.enviado_en_utc
           FROM encuesta_respuesta r
           JOIN encuesta_envio e ON e.id_envio = r.id_envio
           WHERE r.id_encuesta_def = ? AND r.id_pregunta = ?${respDateSql}
           ORDER BY e.enviado_en_utc DESC, r.id_respuesta DESC`
        )
        .all(idEncuestaDef, q.id_pregunta, ...respDateParams) as Array<{
        id_respuesta: number;
        valor_texto: string;
        utc_date: string;
        enviado_en_utc: string;
      }>;

      preguntasReporte.push({
        id_pregunta: q.id_pregunta,
        orden: q.orden,
        clave: q.clave,
        enunciado: q.enunciado,
        tipo: q.tipo,
        obligatoria: q.obligatoria === 1,
        total_respuestas: textRows.length,
        respuestas: textRows,
      });
    }
  }

  return {
    ok: true,
    reporte: {
      encuesta: {
        id_encuesta_def: def.id_encuesta_def,
        codigo: def.codigo,
        titulo: def.titulo,
        descripcion: def.descripcion,
        activa: def.activa === 1,
      },
      filtros: {
        desde,
        hasta,
        tipo,
      },
      resumen: {
        total_envios: summary.total_envios,
        participantes_unicos: summary.participantes_unicos,
        primera_respuesta_utc: summary.primera_respuesta_utc,
        ultima_respuesta_utc: summary.ultima_respuesta_utc,
        serie_diaria: serieDiaria,
      },
      preguntas: preguntasReporte,
    },
  };
}
