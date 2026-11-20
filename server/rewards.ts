import { db } from './db.ts';

export type ActivitySource = 'evaluacion' | 'video';

export interface PointRule {
  clave: 'evaluacion_completada' | 'video_visto';
  puntos_base: number;
  puntos_adicionales: number;
  descripcion: string;
  actualizado_en: string;
}

export interface GrantPointsResult {
  otorgado: boolean;
  ya_otorgado: boolean;
  puntos_base: number;
  puntos_adicionales: number;
  total_puntos: number;
  saldo_actual: number;
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

export type RedeemResult =
  | {
      ok: true;
      saldo_actual: number;
      fondo_activo: string | null;
      estilo_activo: string | null;
      recompensa: RewardCatalogItem;
      message: string;
    }
  | {
      ok: false;
      status: number;
      code: 'REWARD_NOT_FOUND' | 'REWARD_ALREADY_OWNED' | 'INSUFFICIENT_POINTS';
      error: string;
    };

function parseNonNegativeEnv(envName: string): number | null {
  const raw = process.env[envName];
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function getPointRule(clave: 'evaluacion_completada' | 'video_visto'): PointRule {
  const row = db
    .prepare('SELECT clave, puntos_base, puntos_adicionales, descripcion, actualizado_en FROM regla_puntos WHERE clave = ?')
    .get(clave) as
    | {
        clave: 'evaluacion_completada' | 'video_visto';
        puntos_base: number;
        puntos_adicionales: number;
        descripcion: string;
        actualizado_en: string;
      }
    | undefined;

  const fallbackBase = clave === 'evaluacion_completada' ? 50 : 30;
  const fallbackBonus = clave === 'evaluacion_completada' ? 20 : 10;

  let base = row ? Number(row.puntos_base) : fallbackBase;
  let bonus = row ? Number(row.puntos_adicionales) : fallbackBonus;

  if (clave === 'evaluacion_completada') {
    const envBase = parseNonNegativeEnv('POINTS_EVAL_BASE');
    const envBonus = parseNonNegativeEnv('POINTS_EVAL_BONUS');
    if (envBase !== null) base = envBase;
    if (envBonus !== null) bonus = envBonus;
  } else {
    const envBase = parseNonNegativeEnv('POINTS_VIDEO_BASE');
    const envBonus = parseNonNegativeEnv('POINTS_VIDEO_BONUS');
    if (envBase !== null) base = envBase;
    if (envBonus !== null) bonus = envBonus;
  }

  return {
    clave,
    puntos_base: base,
    puntos_adicionales: bonus,
    descripcion:
      row?.descripcion ??
      (clave === 'evaluacion_completada'
        ? 'Puntos por completar una evaluación interactiva por primera vez'
        : 'Puntos por finalizar un video educativo por primera vez'),
    actualizado_en: row?.actualizado_en ?? new Date().toISOString(),
  };
}

export function listPointRules(): PointRule[] {
  return [getPointRule('evaluacion_completada'), getPointRule('video_visto')];
}

export function updatePointRule(
  clave: 'evaluacion_completada' | 'video_visto',
  puntosBase: number,
  puntosAdicionales: number
): PointRule {
  db.prepare(
    `UPDATE regla_puntos
     SET puntos_base = ?, puntos_adicionales = ?, actualizado_en = datetime('now')
     WHERE clave = ?`
  ).run(puntosBase, puntosAdicionales, clave);
  return getPointRule(clave);
}

export function buildActivityUniqueKey(
  idUsuario: number,
  fuente: ActivitySource,
  referenciaId: number
): string {
  return `${fuente === 'evaluacion' ? 'eval' : 'video'}:${idUsuario}:${referenciaId}`;
}

export function hasCompletedActivity(
  idUsuario: number,
  fuente: ActivitySource,
  referenciaId: number
): boolean {
  const uniqueKey = buildActivityUniqueKey(idUsuario, fuente, referenciaId);
  const existing = db
    .prepare('SELECT id_movimiento FROM movimiento_puntos WHERE clave_unica = ?')
    .get(uniqueKey);
  return Boolean(existing);
}

export function getUserBalance(idUsuario: number): number {
  const row = db.prepare('SELECT puntos_saldo FROM usuario WHERE id_usuario = ?').get(idUsuario) as
    | { puntos_saldo: number }
    | undefined;
  return row ? Number(row.puntos_saldo) : 0;
}

export function grantActivityPoints(params: {
  idUsuario: number;
  fuente: ActivitySource;
  referenciaId: number;
  titulo: string;
}): GrantPointsResult {
  const ruleKey = params.fuente === 'evaluacion' ? 'evaluacion_completada' : 'video_visto';
  const rule = getPointRule(ruleKey);
  const totalPuntos = rule.puntos_base + rule.puntos_adicionales;
  const uniqueKey = buildActivityUniqueKey(params.idUsuario, params.fuente, params.referenciaId);
  const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const labelFuente = params.fuente === 'evaluacion' ? 'Evaluación completada' : 'Video finalizado';
  const descripcion = `${labelFuente}: ${params.titulo} (${rule.puntos_base} base + ${rule.puntos_adicionales} adicionales)`;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const insertRes = db
      .prepare(
        `INSERT OR IGNORE INTO movimiento_puntos
         (id_usuario, tipo, fuente, referencia_id, clave_unica, puntos_base, puntos_adicionales, total_puntos, descripcion, fecha_movimiento)
         VALUES (?, 'ganado', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.idUsuario,
        params.fuente,
        params.referenciaId,
        uniqueKey,
        rule.puntos_base,
        rule.puntos_adicionales,
        totalPuntos,
        descripcion,
        fecha
      );

    if (Number(insertRes.changes) === 0) {
      db.exec('COMMIT;');
      return {
        otorgado: false,
        ya_otorgado: true,
        puntos_base: 0,
        puntos_adicionales: 0,
        total_puntos: 0,
        saldo_actual: getUserBalance(params.idUsuario),
      };
    }

    db.prepare('UPDATE usuario SET puntos_saldo = puntos_saldo + ? WHERE id_usuario = ?').run(
      totalPuntos,
      params.idUsuario
    );

    db.exec('COMMIT;');
    return {
      otorgado: true,
      ya_otorgado: false,
      puntos_base: rule.puntos_base,
      puntos_adicionales: rule.puntos_adicionales,
      total_puntos: totalPuntos,
      saldo_actual: getUserBalance(params.idUsuario),
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar si ya no hay transacción abierta
    }
    throw err;
  }
}

export function getStoreSnapshot(idUsuario: number) {
  const userState = db
    .prepare('SELECT puntos_saldo, fondo_activo, estilo_activo FROM usuario WHERE id_usuario = ?')
    .get(idUsuario) as
    | { puntos_saldo: number; fondo_activo: string | null; estilo_activo: string | null }
    | undefined;

  const saldo = userState ? Number(userState.puntos_saldo) : 0;
  const fondoActivo = userState?.fondo_activo ?? null;
  const estiloActivo = userState?.estilo_activo ?? null;

  const ownedRows = db
    .prepare('SELECT id_recompensa FROM usuario_recompensa WHERE id_usuario = ?')
    .all(idUsuario) as Array<{ id_recompensa: number }>;
  const ownedIds = new Set(ownedRows.map((r) => Number(r.id_recompensa)));

  const catalogRows = db
    .prepare(
      `SELECT id_recompensa, codigo, nombre, descripcion, categoria, costo_puntos, valor_css, preview_color
       FROM recompensa
       WHERE activa = 1
       ORDER BY categoria ASC, costo_puntos ASC, id_recompensa ASC`
    )
    .all() as Array<{
    id_recompensa: number;
    codigo: string;
    nombre: string;
    descripcion: string;
    categoria: 'fondo' | 'estilo';
    costo_puntos: number;
    valor_css: string;
    preview_color: string;
  }>;

  const recompensas: RewardCatalogItem[] = catalogRows.map((r) => ({
    id_recompensa: Number(r.id_recompensa),
    codigo: r.codigo,
    nombre: r.nombre,
    descripcion: r.descripcion,
    categoria: r.categoria,
    costo_puntos: Number(r.costo_puntos),
    valor_css: r.valor_css,
    preview_color: r.preview_color,
    adquirida: ownedIds.has(Number(r.id_recompensa)),
    equipada: r.categoria === 'fondo' ? fondoActivo === r.codigo : estiloActivo === r.codigo,
  }));

  const historial = db
    .prepare(
      `SELECT id_movimiento, tipo, fuente, referencia_id, puntos_base, puntos_adicionales, total_puntos, descripcion, fecha_movimiento
       FROM movimiento_puntos
       WHERE id_usuario = ?
       ORDER BY fecha_movimiento DESC, id_movimiento DESC
       LIMIT 50`
    )
    .all(idUsuario) as unknown as PointMovement[];

  return {
    saldo,
    fondo_activo: fondoActivo,
    estilo_activo: estiloActivo,
    reglas: listPointRules(),
    recompensas,
    historial: historial.map((h) => ({
      ...h,
      id_movimiento: Number(h.id_movimiento),
      referencia_id: Number(h.referencia_id),
      puntos_base: Number(h.puntos_base),
      puntos_adicionales: Number(h.puntos_adicionales),
      total_puntos: Number(h.total_puntos),
    })),
  };
}

export function redeemReward(idUsuario: number, idRecompensa: number): RedeemResult {
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const reward = db
      .prepare(
        `SELECT id_recompensa, codigo, nombre, descripcion, categoria, costo_puntos, valor_css, preview_color
         FROM recompensa
         WHERE id_recompensa = ? AND activa = 1`
      )
      .get(idRecompensa) as
      | {
          id_recompensa: number;
          codigo: string;
          nombre: string;
          descripcion: string;
          categoria: 'fondo' | 'estilo';
          costo_puntos: number;
          valor_css: string;
          preview_color: string;
        }
      | undefined;

    if (!reward) {
      db.exec('ROLLBACK;');
      return {
        ok: false,
        status: 404,
        code: 'REWARD_NOT_FOUND',
        error: 'La recompensa seleccionada no existe o no está disponible.',
      };
    }

    const alreadyOwned = db
      .prepare('SELECT id_usuario_recompensa FROM usuario_recompensa WHERE id_usuario = ? AND id_recompensa = ?')
      .get(idUsuario, idRecompensa);

    if (alreadyOwned) {
      db.exec('ROLLBACK;');
      return {
        ok: false,
        status: 409,
        code: 'REWARD_ALREADY_OWNED',
        error: 'Ya adquiriste esta recompensa anteriormente.',
      };
    }

    const costo = Number(reward.costo_puntos);
    // Descuento atómico: solo resta si puntos_saldo >= costo
    const updateBalance = db
      .prepare('UPDATE usuario SET puntos_saldo = puntos_saldo - ? WHERE id_usuario = ? AND puntos_saldo >= ?')
      .run(costo, idUsuario, costo);

    if (Number(updateBalance.changes) === 0) {
      db.exec('ROLLBACK;');
      return {
        ok: false,
        status: 409,
        code: 'INSUFFICIENT_POINTS',
        error: `No tienes puntos suficientes para canjear "${reward.nombre}" (${costo} pts).`,
      };
    }

    const fecha = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare(
      'INSERT INTO usuario_recompensa (id_usuario, id_recompensa, fecha_canje) VALUES (?, ?, ?)'
    ).run(idUsuario, idRecompensa, fecha);

    db.prepare(
      `INSERT INTO movimiento_puntos
       (id_usuario, tipo, fuente, referencia_id, clave_unica, puntos_base, puntos_adicionales, total_puntos, descripcion, fecha_movimiento)
       VALUES (?, 'canjeado', 'canje', ?, NULL, 0, 0, ?, ?, ?)`
    ).run(idUsuario, idRecompensa, -costo, `Canje en tienda: ${reward.nombre}`, fecha);

    // Aplicar automáticamente la recompensa recién canjeada
    if (reward.categoria === 'fondo') {
      db.prepare('UPDATE usuario SET fondo_activo = ? WHERE id_usuario = ?').run(reward.codigo, idUsuario);
    } else {
      db.prepare('UPDATE usuario SET estilo_activo = ? WHERE id_usuario = ?').run(reward.codigo, idUsuario);
    }

    const userRow = db
      .prepare('SELECT puntos_saldo, fondo_activo, estilo_activo FROM usuario WHERE id_usuario = ?')
      .get(idUsuario) as { puntos_saldo: number; fondo_activo: string | null; estilo_activo: string | null };

    db.exec('COMMIT;');

    return {
      ok: true,
      saldo_actual: Number(userRow.puntos_saldo),
      fondo_activo: userRow.fondo_activo ?? null,
      estilo_activo: userRow.estilo_activo ?? null,
      recompensa: {
        ...reward,
        id_recompensa: Number(reward.id_recompensa),
        costo_puntos: costo,
        adquirida: true,
        equipada: true,
      },
      message: `¡Canje exitoso! "${reward.nombre}" fue desbloqueado y aplicado a tu perfil.`,
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar si ya no hay transacción abierta
    }
    throw err;
  }
}

export function equipReward(
  idUsuario: number,
  categoria: 'fondo' | 'estilo',
  codigo: string | null
): { ok: true; fondo_activo: string | null; estilo_activo: string | null } | { ok: false; status: number; error: string } {
  if (codigo !== null) {
    const owned = db
      .prepare(
        `SELECT r.codigo, r.categoria
         FROM usuario_recompensa ur
         JOIN recompensa r ON r.id_recompensa = ur.id_recompensa
         WHERE ur.id_usuario = ? AND r.codigo = ? AND r.categoria = ?`
      )
      .get(idUsuario, codigo, categoria);

    if (!owned) {
      return {
        ok: false,
        status: 403,
        error: 'Primero debes canjear esta recompensa en la tienda antes de aplicarla.',
      };
    }
  }

  if (categoria === 'fondo') {
    db.prepare('UPDATE usuario SET fondo_activo = ? WHERE id_usuario = ?').run(codigo, idUsuario);
  } else {
    db.prepare('UPDATE usuario SET estilo_activo = ? WHERE id_usuario = ?').run(codigo, idUsuario);
  }

  const userRow = db
    .prepare('SELECT fondo_activo, estilo_activo FROM usuario WHERE id_usuario = ?')
    .get(idUsuario) as { fondo_activo: string | null; estilo_activo: string | null };

  return {
    ok: true,
    fondo_activo: userRow.fondo_activo ?? null,
    estilo_activo: userRow.estilo_activo ?? null,
  };
}
