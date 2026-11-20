import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, migrateLegacyHashValue } from './passwordCrypto.ts';

export const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), 'aba.sqlite');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rol (
      id_rol INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_rol TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS usuario (
      id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      id_rol INTEGER NOT NULL,
      session_version INTEGER NOT NULL DEFAULT 1,
      puntos_saldo INTEGER NOT NULL DEFAULT 0 CHECK (puntos_saldo >= 0),
      fondo_activo TEXT DEFAULT NULL,
      estilo_activo TEXT DEFAULT NULL,
      FOREIGN KEY (id_rol) REFERENCES rol(id_rol) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS administrador (
      id_administrador INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL UNIQUE,
      nivel_acceso TEXT DEFAULT 'SuperAdmin',
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grado (
      id_grado INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_grado TEXT NOT NULL,
      seccion TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS profesor (
      id_profesor INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL UNIQUE,
      id_grado INTEGER NOT NULL,
      especialidad TEXT DEFAULT NULL,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_grado) REFERENCES grado(id_grado) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS estudiante (
      id_estudiante INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL UNIQUE,
      id_grado INTEGER NOT NULL,
      codigo_estudiantil TEXT UNIQUE DEFAULT NULL,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_grado) REFERENCES grado(id_grado) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saber (
      id_saber INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT NULL,
      id_grado INTEGER NOT NULL,
      FOREIGN KEY (id_grado) REFERENCES grado(id_grado) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video (
      id_video INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      url_video TEXT NOT NULL,
      duracion_segundos INTEGER DEFAULT NULL,
      id_saber INTEGER NOT NULL,
      FOREIGN KEY (id_saber) REFERENCES saber(id_saber) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS evaluacion (
      id_evaluacion INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      instrucciones TEXT DEFAULT NULL,
      id_saber INTEGER NOT NULL,
      FOREIGN KEY (id_saber) REFERENCES saber(id_saber) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS respuestas (
      id_respuesta INTEGER PRIMARY KEY AUTOINCREMENT,
      enunciado_pregunta TEXT NOT NULL,
      opcion_a TEXT NOT NULL,
      opcion_b TEXT NOT NULL,
      opcion_c TEXT NOT NULL,
      id_evaluacion INTEGER NOT NULL,
      FOREIGN KEY (id_evaluacion) REFERENCES evaluacion(id_evaluacion) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS respuesta_correcta (
      id_respuesta_correcta INTEGER PRIMARY KEY AUTOINCREMENT,
      id_respuesta INTEGER NOT NULL UNIQUE,
      opcion_correcta TEXT NOT NULL CHECK(opcion_correcta IN ('A', 'B', 'C')),
      explicacion TEXT DEFAULT NULL,
      FOREIGN KEY (id_respuesta) REFERENCES respuestas(id_respuesta) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS respuesta_incorrecta (
      id_respuesta_incorrecta INTEGER PRIMARY KEY AUTOINCREMENT,
      id_respuesta INTEGER NOT NULL,
      opcion_incorrecta TEXT NOT NULL CHECK(opcion_incorrecta IN ('A', 'B', 'C')),
      retroalimentacion TEXT DEFAULT NULL,
      FOREIGN KEY (id_respuesta) REFERENCES respuestas(id_respuesta) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS puntaje (
      id_puntaje INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_estudiante INTEGER DEFAULT NULL,
      id_evaluacion INTEGER NOT NULL,
      calificacion REAL NOT NULL,
      fecha_realizacion TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_estudiante) REFERENCES estudiante(id_estudiante) ON DELETE CASCADE,
      FOREIGN KEY (id_evaluacion) REFERENCES evaluacion(id_evaluacion) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encuesta_satisfaccion (
      id_encuesta INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      calificacion_estrellas INTEGER NOT NULL CHECK(calificacion_estrellas BETWEEN 1 AND 5),
      comentario TEXT DEFAULT NULL,
      fecha_registro TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_token (
      id_token INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS regla_puntos (
      clave TEXT PRIMARY KEY,
      puntos_base INTEGER NOT NULL DEFAULT 0 CHECK (puntos_base >= 0),
      puntos_adicionales INTEGER NOT NULL DEFAULT 0 CHECK (puntos_adicionales >= 0),
      descripcion TEXT NOT NULL,
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movimiento_puntos (
      id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('ganado', 'canjeado')),
      fuente TEXT NOT NULL CHECK (fuente IN ('evaluacion', 'video', 'canje')),
      referencia_id INTEGER NOT NULL,
      clave_unica TEXT DEFAULT NULL UNIQUE,
      puntos_base INTEGER NOT NULL DEFAULT 0,
      puntos_adicionales INTEGER NOT NULL DEFAULT 0,
      total_puntos INTEGER NOT NULL,
      descripcion TEXT NOT NULL,
      fecha_movimiento TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recompensa (
      id_recompensa INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      categoria TEXT NOT NULL CHECK (categoria IN ('fondo', 'estilo')),
      costo_puntos INTEGER NOT NULL CHECK (costo_puntos > 0),
      valor_css TEXT NOT NULL,
      preview_color TEXT NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS usuario_recompensa (
      id_usuario_recompensa INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_recompensa INTEGER NOT NULL,
      fecha_canje TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (id_usuario, id_recompensa),
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_recompensa) REFERENCES recompensa(id_recompensa) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS competencia_sala (
      id_sala INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      id_saber INTEGER NOT NULL,
      id_creador INTEGER NOT NULL,
      estado TEXT NOT NULL CHECK (estado IN ('esperando', 'en_curso', 'finalizada', 'cancelada')),
      creada_en TEXT NOT NULL DEFAULT (datetime('now')),
      iniciada_en_ms INTEGER DEFAULT NULL,
      finalizada_en_ms INTEGER DEFAULT NULL,
      motivo_cierre TEXT DEFAULT NULL,
      id_ganador INTEGER DEFAULT NULL,
      FOREIGN KEY (id_saber) REFERENCES saber(id_saber) ON DELETE CASCADE,
      FOREIGN KEY (id_creador) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_ganador) REFERENCES usuario(id_usuario) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS competencia_pregunta (
      id_competencia_pregunta INTEGER PRIMARY KEY AUTOINCREMENT,
      id_sala INTEGER NOT NULL,
      orden INTEGER NOT NULL,
      id_respuesta INTEGER NOT NULL,
      UNIQUE (id_sala, orden),
      FOREIGN KEY (id_sala) REFERENCES competencia_sala(id_sala) ON DELETE CASCADE,
      FOREIGN KEY (id_respuesta) REFERENCES respuestas(id_respuesta) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS competencia_participante (
      id_participante INTEGER PRIMARY KEY AUTOINCREMENT,
      id_sala INTEGER NOT NULL,
      id_usuario INTEGER NOT NULL,
      estado TEXT NOT NULL CHECK (estado IN ('conectado', 'finalizado', 'desconectado')),
      puntuacion REAL NOT NULL DEFAULT 0,
      aciertos INTEGER NOT NULL DEFAULT 0,
      total_preguntas INTEGER NOT NULL DEFAULT 0,
      tiempo_ms INTEGER DEFAULT NULL,
      finalizado_en_ms INTEGER DEFAULT NULL,
      desconectado_en_ms INTEGER DEFAULT NULL,
      UNIQUE (id_sala, id_usuario),
      FOREIGN KEY (id_sala) REFERENCES competencia_sala(id_sala) ON DELETE CASCADE,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS competencia_respuesta_usuario (
      id_comp_resp INTEGER PRIMARY KEY AUTOINCREMENT,
      id_sala INTEGER NOT NULL,
      id_usuario INTEGER NOT NULL,
      id_respuesta INTEGER NOT NULL,
      opcion_elegida TEXT NOT NULL CHECK (opcion_elegida IN ('A', 'B', 'C')),
      es_correcta INTEGER NOT NULL CHECK (es_correcta IN (0, 1)),
      respondida_en_ms INTEGER NOT NULL,
      UNIQUE (id_sala, id_usuario, id_respuesta),
      FOREIGN KEY (id_sala) REFERENCES competencia_sala(id_sala) ON DELETE CASCADE,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_respuesta) REFERENCES respuestas(id_respuesta) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refresh_token (
      id_refresh_token INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      persistente INTEGER NOT NULL DEFAULT 0 CHECK (persistente IN (0, 1)),
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER DEFAULT NULL,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_bloqueo (
      scope TEXT NOT NULL CHECK (scope IN ('account_ip', 'account', 'ip')),
      clave TEXT NOT NULL,
      intentos_fallidos INTEGER NOT NULL DEFAULT 0,
      primer_intento_ms INTEGER NOT NULL,
      ultimo_intento_ms INTEGER NOT NULL,
      bloqueado_hasta_ms INTEGER DEFAULT NULL,
      PRIMARY KEY (scope, clave)
    );

    CREATE TABLE IF NOT EXISTS auth_audit_log (
      id_evento INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_evento TEXT NOT NULL,
      scope TEXT DEFAULT NULL,
      email_enmascarado TEXT DEFAULT NULL,
      ip_origen TEXT NOT NULL,
      intentos INTEGER NOT NULL DEFAULT 0,
      bloqueado_hasta_ms INTEGER DEFAULT NULL,
      detalle TEXT DEFAULT NULL,
      creado_en_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sesion_actividad (
      id_sesion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      session_key TEXT NOT NULL UNIQUE,
      fecha_dia TEXT NOT NULL,
      inicio_ms INTEGER NOT NULL,
      fin_ms INTEGER NOT NULL,
      duracion_activa_ms INTEGER NOT NULL DEFAULT 0 CHECK (duracion_activa_ms >= 0),
      pausas_ms INTEGER NOT NULL DEFAULT 0 CHECK (pausas_ms >= 0),
      estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'pausada', 'finalizada')),
      ultimo_latido_ms INTEGER NOT NULL,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sala_virtual (
      id_sala_virtual INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      descripcion TEXT DEFAULT NULL,
      id_saber INTEGER DEFAULT NULL,
      id_creador INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cerrada')),
      creada_en TEXT NOT NULL DEFAULT (datetime('now')),
      cerrada_en TEXT DEFAULT NULL,
      FOREIGN KEY (id_saber) REFERENCES saber(id_saber) ON DELETE SET NULL,
      FOREIGN KEY (id_creador) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sala_virtual_mensaje (
      id_mensaje INTEGER PRIMARY KEY AUTOINCREMENT,
      id_sala_virtual INTEGER NOT NULL,
      id_usuario INTEGER NOT NULL,
      contenido TEXT NOT NULL,
      enviado_en_ms INTEGER NOT NULL,
      FOREIGN KEY (id_sala_virtual) REFERENCES sala_virtual(id_sala_virtual) ON DELETE CASCADE,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS telemetry_event (
      id_seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      schema_version TEXT NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at_utc TEXT NOT NULL,
      occurred_at_ms INTEGER NOT NULL,
      utc_date TEXT NOT NULL,
      actor_id_hash TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      session_or_request_id TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('backend_api', 'frontend_ui', 'websocket', 'system_worker')),
      entity_type TEXT DEFAULT NULL,
      entity_id TEXT DEFAULT NULL,
      duration_ms REAL DEFAULT NULL,
      status_code INTEGER DEFAULT NULL,
      outcome TEXT DEFAULT NULL CHECK (outcome IS NULL OR outcome IN ('success', 'client_error', 'server_error')),
      metadata_json TEXT DEFAULT NULL,
      ingested_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_pipeline_failure (
      id_failure INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT DEFAULT NULL,
      error_message TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 1,
      payload_summary TEXT DEFAULT NULL,
      recorded_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_favorito (
      id_favorito INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_video INTEGER NOT NULL,
      creado_en TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (id_usuario, id_video),
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_video) REFERENCES video(id_video) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video_visualizacion (
      id_visualizacion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_video INTEGER NOT NULL,
      session_view_id TEXT NOT NULL,
      fecha_visualizacion_utc TEXT NOT NULL,
      utc_date TEXT NOT NULL,
      duracion_vista_segundos INTEGER NOT NULL DEFAULT 0 CHECK (duracion_vista_segundos >= 0),
      posicion_max_segundos INTEGER NOT NULL DEFAULT 0 CHECK (posicion_max_segundos >= 0),
      duracion_video_segundos INTEGER NOT NULL DEFAULT 0 CHECK (duracion_video_segundos >= 0),
      completado INTEGER NOT NULL DEFAULT 0 CHECK (completado IN (0, 1)),
      actualizado_en_utc TEXT NOT NULL,
      UNIQUE (id_usuario, id_video, session_view_id),
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
      FOREIGN KEY (id_video) REFERENCES video(id_video) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encuesta_definicion (
      id_encuesta_def INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT NULL,
      activa INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
      creada_en_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encuesta_pregunta (
      id_pregunta INTEGER PRIMARY KEY AUTOINCREMENT,
      id_encuesta_def INTEGER NOT NULL,
      orden INTEGER NOT NULL CHECK (orden >= 1),
      clave TEXT NOT NULL,
      enunciado TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('opcion_unica', 'opcion_multiple', 'escala', 'texto_libre')),
      obligatoria INTEGER NOT NULL DEFAULT 1 CHECK (obligatoria IN (0, 1)),
      escala_min INTEGER DEFAULT NULL,
      escala_max INTEGER DEFAULT NULL,
      UNIQUE (id_encuesta_def, orden),
      UNIQUE (id_encuesta_def, clave),
      FOREIGN KEY (id_encuesta_def) REFERENCES encuesta_definicion(id_encuesta_def) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encuesta_opcion (
      id_opcion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_pregunta INTEGER NOT NULL,
      orden INTEGER NOT NULL CHECK (orden >= 1),
      clave TEXT NOT NULL,
      etiqueta TEXT NOT NULL,
      UNIQUE (id_pregunta, orden),
      UNIQUE (id_pregunta, clave),
      FOREIGN KEY (id_pregunta) REFERENCES encuesta_pregunta(id_pregunta) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encuesta_envio (
      id_envio INTEGER PRIMARY KEY AUTOINCREMENT,
      id_encuesta_def INTEGER NOT NULL,
      id_usuario INTEGER NOT NULL,
      enviado_en_utc TEXT NOT NULL,
      utc_date TEXT NOT NULL,
      UNIQUE (id_encuesta_def, id_usuario),
      FOREIGN KEY (id_encuesta_def) REFERENCES encuesta_definicion(id_encuesta_def) ON DELETE CASCADE,
      FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS encuesta_respuesta (
      id_respuesta INTEGER PRIMARY KEY AUTOINCREMENT,
      id_envio INTEGER NOT NULL,
      id_encuesta_def INTEGER NOT NULL,
      id_pregunta INTEGER NOT NULL,
      tipo_pregunta TEXT NOT NULL CHECK (tipo_pregunta IN ('opcion_unica', 'opcion_multiple', 'escala', 'texto_libre')),
      id_opcion INTEGER DEFAULT NULL,
      valor_numerico REAL DEFAULT NULL,
      valor_texto TEXT DEFAULT NULL,
      utc_date TEXT NOT NULL,
      creado_en_utc TEXT NOT NULL,
      CHECK (
        (tipo_pregunta IN ('opcion_unica', 'opcion_multiple') AND id_opcion IS NOT NULL AND valor_numerico IS NULL AND valor_texto IS NULL)
        OR (tipo_pregunta = 'escala' AND id_opcion IS NULL AND valor_numerico IS NOT NULL AND valor_texto IS NULL)
        OR (tipo_pregunta = 'texto_libre' AND id_opcion IS NULL AND valor_numerico IS NULL AND valor_texto IS NOT NULL)
      ),
      FOREIGN KEY (id_envio) REFERENCES encuesta_envio(id_envio) ON DELETE CASCADE,
      FOREIGN KEY (id_encuesta_def) REFERENCES encuesta_definicion(id_encuesta_def) ON DELETE CASCADE,
      FOREIGN KEY (id_pregunta) REFERENCES encuesta_pregunta(id_pregunta) ON DELETE CASCADE,
      FOREIGN KEY (id_opcion) REFERENCES encuesta_opcion(id_opcion) ON DELETE CASCADE
    );
  `);

  // Migración segura para bases de datos existentes
  const userCols = db.prepare('PRAGMA table_info(usuario)').all() as Array<{ name: string }>;
  if (!userCols.some((c) => c.name === 'session_version')) {
    db.exec('ALTER TABLE usuario ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;');
  }
  if (!userCols.some((c) => c.name === 'puntos_saldo')) {
    db.exec('ALTER TABLE usuario ADD COLUMN puntos_saldo INTEGER NOT NULL DEFAULT 0 CHECK (puntos_saldo >= 0);');
  }
  if (!userCols.some((c) => c.name === 'fondo_activo')) {
    db.exec('ALTER TABLE usuario ADD COLUMN fondo_activo TEXT DEFAULT NULL;');
  }
  if (!userCols.some((c) => c.name === 'estilo_activo')) {
    db.exec('ALTER TABLE usuario ADD COLUMN estilo_activo TEXT DEFAULT NULL;');
  }

  // Migración segura para tabla puntaje: añadir id_usuario y permitir id_estudiante nulo
  const puntajeCols = db.prepare('PRAGMA table_info(puntaje)').all() as Array<{ name: string }>;
  if (!puntajeCols.some((c) => c.name === 'id_usuario')) {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE puntaje_migrada (
        id_puntaje INTEGER PRIMARY KEY AUTOINCREMENT,
        id_usuario INTEGER NOT NULL,
        id_estudiante INTEGER DEFAULT NULL,
        id_evaluacion INTEGER NOT NULL,
        calificacion REAL NOT NULL,
        fecha_realizacion TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
        FOREIGN KEY (id_estudiante) REFERENCES estudiante(id_estudiante) ON DELETE CASCADE,
        FOREIGN KEY (id_evaluacion) REFERENCES evaluacion(id_evaluacion) ON DELETE CASCADE
      );
      INSERT INTO puntaje_migrada (id_puntaje, id_usuario, id_estudiante, id_evaluacion, calificacion, fecha_realizacion)
      SELECT p.id_puntaje, e.id_usuario, p.id_estudiante, p.id_evaluacion, p.calificacion, p.fecha_realizacion
      FROM puntaje p
      JOIN estudiante e ON e.id_estudiante = p.id_estudiante;
      DROP TABLE puntaje;
      ALTER TABLE puntaje_migrada RENAME TO puntaje;
      COMMIT;
    `);
  }

  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_puntaje_leaderboard ON puntaje (id_evaluacion, calificacion DESC, fecha_realizacion ASC, id_puntaje ASC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_movimientos_usuario ON movimiento_puntos (id_usuario, fecha_movimiento DESC, id_movimiento DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_comp_participante_usuario ON competencia_participante (id_usuario, id_sala DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_refresh_token_usuario ON refresh_token (id_usuario, revoked_at);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_auth_audit_creado ON auth_audit_log (creado_en_ms DESC, id_evento DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_sesion_act_usuario_fecha ON sesion_actividad (id_usuario, inicio_ms DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_sesion_act_fecha ON sesion_actividad (fecha_dia DESC, inicio_ms DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_sala_virtual_estado ON sala_virtual (estado, id_sala_virtual DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_sala_virtual_msg ON sala_virtual_mensaje (id_sala_virtual, id_mensaje DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_telemetry_utc_date_type ON telemetry_event (utc_date DESC, event_type, occurred_at_ms DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_telemetry_actor_date ON telemetry_event (actor_id_hash, utc_date DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_telemetry_origin_outcome ON telemetry_event (origin, outcome, utc_date DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_telemetry_entity ON telemetry_event (entity_type, entity_id, utc_date DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_video_favorito_usuario ON video_favorito (id_usuario, creado_en DESC, id_favorito DESC);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_video_vis_usuario_fecha ON video_visualizacion (id_usuario, utc_date DESC, id_video);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_video_vis_video_usuario ON video_visualizacion (id_video, id_usuario);'
  );
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_enc_resp_single_row ON encuesta_respuesta (id_envio, id_pregunta) WHERE tipo_pregunta IN (\'opcion_unica\', \'escala\', \'texto_libre\');'
  );
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_enc_resp_multiple_opt ON encuesta_respuesta (id_envio, id_pregunta, id_opcion) WHERE tipo_pregunta = \'opcion_multiple\';'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_enc_envio_def_fecha ON encuesta_envio (id_encuesta_def, utc_date, id_envio);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_enc_resp_agg ON encuesta_respuesta (id_encuesta_def, id_pregunta, utc_date, id_opcion);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_enc_resp_tipo ON encuesta_respuesta (id_encuesta_def, tipo_pregunta, utc_date);'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_enc_resp_envio ON encuesta_respuesta (id_envio);'
  );

  // Semilla idempotente de reglas parametrizables de puntos y catálogo de recompensas
  const insertRegla = db.prepare(
    'INSERT OR IGNORE INTO regla_puntos (clave, puntos_base, puntos_adicionales, descripcion) VALUES (?, ?, ?, ?)'
  );
  insertRegla.run(
    'evaluacion_completada',
    50,
    20,
    'Puntos por completar una evaluación interactiva por primera vez'
  );
  insertRegla.run(
    'video_visto',
    30,
    10,
    'Puntos por finalizar un video educativo por primera vez'
  );

  const insertRecompensa = db.prepare(
    `INSERT OR IGNORE INTO recompensa (codigo, nombre, descripcion, categoria, costo_puntos, valor_css, preview_color, activa)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  const catalogoRecompensas: Array<[string, string, string, 'fondo' | 'estilo', number, string, string]> = [
    [
      'fondo_papel_cuadricula',
      'Cuaderno Cuadriculado',
      'Lienzo escolar blanco con retícula geométrica azul tenue de alta legibilidad.',
      'fondo',
      80,
      'fondo_papel_cuadricula',
      '#eff6ff',
    ],
    [
      'fondo_brisa_botanica',
      'Brisa Botánica',
      'Fondo luminoso en tonos menta suave inspirado en aulas abiertas.',
      'fondo',
      120,
      'fondo_brisa_botanica',
      '#ecfdf5',
    ],
    [
      'fondo_cielo_aurora',
      'Horizonte Índigo',
      'Degradado sutil azul cielo e índigo claro para sesiones de estudio.',
      'fondo',
      160,
      'fondo_cielo_aurora',
      '#eef2ff',
    ],
    [
      'estilo_esmeralda',
      'Estilo Bosque Esmeralda',
      'Acentos principales en verde esmeralda en cabecera, enlaces y botones.',
      'estilo',
      100,
      'estilo_esmeralda',
      '#047857',
    ],
    [
      'estilo_oceano',
      'Estilo Océano Cobalto',
      'Paleta azul cobalto y cian con alto contraste académico.',
      'estilo',
      140,
      'estilo_oceano',
      '#0369a1',
    ],
    [
      'estilo_indigo_real',
      'Estilo Índigo & Ámbar',
      'Acentos en índigo profundo combinados con detalles cálidos en ámbar.',
      'estilo',
      180,
      'estilo_indigo_real',
      '#4338ca',
    ],
  ];
  for (const r of catalogoRecompensas) {
    insertRecompensa.run(...r);
  }

  // Semilla idempotente de encuesta analítica base con los 4 tipos de pregunta
  const existingSurvey = db
    .prepare('SELECT id_encuesta_def FROM encuesta_definicion WHERE codigo = ?')
    .get('evaluacion-plataforma-aba') as { id_encuesta_def: number } | undefined;

  if (!existingSurvey) {
    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const defRes = db
        .prepare(
          `INSERT INTO encuesta_definicion (codigo, titulo, descripcion, activa, creada_en_utc)
           VALUES (?, ?, ?, 1, ?)`
        )
        .run(
          'evaluacion-plataforma-aba',
          'Encuesta de experiencia de aprendizaje A.B.A.',
          'Recopila valoración general, funciones usadas, calificación de claridad y sugerencias abiertas.',
          '2026-01-01T00:00:00.000Z'
        );
      const idEncuestaDef = Number(defRes.lastInsertRowid);

      const insertPreg = db.prepare(
        `INSERT INTO encuesta_pregunta (id_encuesta_def, orden, clave, enunciado, tipo, obligatoria, escala_min, escala_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insertOpt = db.prepare(
        `INSERT INTO encuesta_opcion (id_pregunta, orden, clave, etiqueta)
         VALUES (?, ?, ?, ?)`
      );

      const p1 = Number(
        insertPreg.run(
          idEncuestaDef,
          1,
          'frecuencia_uso',
          '¿Con qué frecuencia utilizas los videos educativos de la plataforma?',
          'opcion_unica',
          1,
          null,
          null
        ).lastInsertRowid
      );
      insertOpt.run(p1, 1, 'diaria', 'Todos los días');
      insertOpt.run(p1, 2, 'semanal', 'Varias veces a la semana');
      insertOpt.run(p1, 3, 'ocasional', 'Ocasionalmente');

      const p2 = Number(
        insertPreg.run(
          idEncuestaDef,
          2,
          'recursos_utiles',
          '¿Qué recursos te han resultado más útiles para aprender?',
          'opcion_multiple',
          1,
          null,
          null
        ).lastInsertRowid
      );
      insertOpt.run(p2, 1, 'videos_animados', 'Videos didácticos animados');
      insertOpt.run(p2, 2, 'evaluaciones', 'Evaluaciones interactivas');
      insertOpt.run(p2, 3, 'favoritos', 'Lista de videos favoritos');
      insertOpt.run(p2, 4, 'duelos', 'Duelos de conocimiento');

      insertPreg.run(
        idEncuestaDef,
        3,
        'claridad_videos',
        'Del 1 al 5, ¿qué tan claras son las explicaciones de los temas?',
        'escala',
        1,
        1,
        5
      );

      insertPreg.run(
        idEncuestaDef,
        4,
        'comentario_mejora',
        '¿Qué mejorarías o qué nuevo tema te gustaría ver?',
        'texto_libre',
        0,
        null,
        null
      );

      db.exec('COMMIT;');
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignorar
      }
      throw err;
    }
  }

  migrateLegacyPasswords();

  const rolCount = db.prepare('SELECT COUNT(*) as total FROM rol').get() as { total: number };
  if (rolCount.total > 0) {
    return;
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Roles
    const insertRol = db.prepare('INSERT INTO rol (id_rol, nombre_rol) VALUES (?, ?)');
    insertRol.run(1, 'Administrador');
    insertRol.run(2, 'Profesor');
    insertRol.run(3, 'Estudiante');

    // 2. Grados
    const insertGrado = db.prepare('INSERT INTO grado (id_grado, nombre_grado, seccion) VALUES (?, ?, ?)');
    const grados: [number, string, string][] = [
      [1, 'Transición A', 'Mañana'],
      [2, 'Transición B', 'Tarde'],
      [3, 'Primero 101', 'Mañana'],
      [4, 'Primero 102', 'Tarde'],
      [5, 'Segundo 201', 'Mañana'],
      [6, 'Segundo 202', 'Tarde'],
      [7, 'Tercero 301', 'Mañana'],
      [8, 'Tercero 302', 'Tarde'],
      [9, 'Cuarto 401', 'Mañana'],
      [10, 'Quinto 501', 'Mañana'],
    ];
    for (const g of grados) insertGrado.run(...g);

    // 3. Usuarios
    const insertUsuario = db.prepare(
      'INSERT INTO usuario (id_usuario, nombre, apellido, email, password_hash, id_rol) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const usuarios: [number, string, string, string, number][] = [
      [1, 'Aaron', 'Paez', 'admin@aba.com', 1],
      [2, 'Savir', 'Diaz', 'savir.diaz@aba.com', 1],
      [3, 'Sebastian', 'Lozano', 'sebastian.lozano@aba.com', 1],
      [4, 'Carlos', 'Mendoza', 'cmendoza@aba.edu.co', 2],
      [5, 'Martha', 'Gomez', 'mgomez@aba.edu.co', 2],
      [6, 'Mateo', 'Ramirez', 'mateo.r@estudiante.com', 3],
      [7, 'Sofia', 'Torres', 'sofia.t@estudiante.com', 3],
      [8, 'Lucas', 'Rios', 'lucas.r@estudiante.com', 3],
      [9, 'Camila', 'Vargas', 'camila.v@estudiante.com', 3],
      [10, 'Daniel', 'Castro', 'daniel.c@estudiante.com', 3],
    ];
    for (const [id, nombre, apellido, email, idRol] of usuarios) {
      // Sal criptográfica única por cada usuario sembrado
      insertUsuario.run(id, nombre, apellido, email, hashPassword('aba2026'), idRol);
    }

    // 4. Administradores
    const insertAdmin = db.prepare(
      'INSERT INTO administrador (id_administrador, id_usuario, nivel_acceso) VALUES (?, ?, ?)'
    );
    const admins: [number, number, string][] = [
      [1, 1, 'SuperAdmin'],
      [2, 2, 'Gerente General'],
      [3, 3, 'Gerente Ventas'],
      [4, 4, 'Admin Académico'],
      [5, 5, 'Admin Contenido'],
      [6, 6, 'Soporte Nivel 1'],
      [7, 7, 'Soporte Nivel 2'],
      [8, 8, 'Auditor UX'],
      [9, 9, 'Gestion Base Datos'],
      [10, 10, 'Consultor Externo'],
    ];
    for (const a of admins) insertAdmin.run(...a);

    // 5. Profesores
    const insertProfesor = db.prepare(
      'INSERT INTO profesor (id_profesor, id_usuario, id_grado, especialidad) VALUES (?, ?, ?, ?)'
    );
    const profesores: [number, number, number, string][] = [
      [1, 4, 1, 'Pedagogía Infantil'],
      [2, 5, 2, 'Desarrollo Cognitivo'],
      [3, 1, 3, 'Pensamiento Lógico'],
      [4, 2, 4, 'Educación Especial'],
      [5, 3, 5, 'Expresión Artística'],
      [6, 6, 6, 'Lógica Matemática'],
      [7, 7, 7, 'Lenguaje y Lectura'],
      [8, 8, 8, 'Lectoescritura'],
      [9, 9, 9, 'Ciencias Básicas'],
      [10, 10, 10, 'Lógica Computacional'],
    ];
    for (const p of profesores) insertProfesor.run(...p);

    // 6. Estudiantes
    const insertEstudiante = db.prepare(
      'INSERT INTO estudiante (id_estudiante, id_usuario, id_grado, codigo_estudiantil) VALUES (?, ?, ?, ?)'
    );
    const estudiantes: [number, number, number, string][] = [
      [1, 6, 1, 'EST-2026-001'],
      [2, 7, 1, 'EST-2026-002'],
      [3, 8, 2, 'EST-2026-003'],
      [4, 9, 2, 'EST-2026-004'],
      [5, 10, 3, 'EST-2026-005'],
      [6, 1, 3, 'EST-2026-006'],
      [7, 2, 4, 'EST-2026-007'],
      [8, 3, 4, 'EST-2026-008'],
      [9, 4, 5, 'EST-2026-009'],
      [10, 5, 5, 'EST-2026-010'],
    ];
    for (const e of estudiantes) insertEstudiante.run(...e);

    // 7. Saberes
    const insertSaber = db.prepare(
      'INSERT INTO saber (id_saber, titulo, descripcion, id_grado) VALUES (?, ?, ?, ?)'
    );
    const saberes: [number, string, string, number][] = [
      [1, 'Saber Contar 1 al 10', 'Reconocimiento numérico básico', 1],
      [2, 'Saber Las Vocales', 'Identificación de vocales a, e, i, o, u', 1],
      [3, 'Saber Colores Primarios', 'Identificación de amarillo, azul y rojo', 2],
      [4, 'Saber Figuras Geométricas', 'Círculo, cuadrado y triángulo', 2],
      [5, 'Saber Sumas Básicas', 'Sumas sencillas de un solo dígito', 3],
      [6, 'Saber El Abecedario', 'Reconocimiento de consonantes', 3],
      [7, 'Saber Restas sencillas', 'Restas de un dígito', 4],
      [8, 'Saber Silabas', 'Formación de sílabas directas', 4],
      [9, 'Saber Animales', 'Clasificación de animales domésticos', 5],
      [10, 'Saber Las Horas', 'Lectura de reloj análogo', 5],
    ];
    for (const s of saberes) insertSaber.run(...s);

    // 8. Videos
    const insertVideo = db.prepare(
      'INSERT INTO video (id_video, titulo, url_video, duracion_segundos, id_saber) VALUES (?, ?, ?, ?, ?)'
    );
    const videos: [number, string, string, number, number][] = [
      [1, 'Aprendiendo los números del 1 al 10', 'https://aba.edu.co/videos/num1.mp4', 180, 1],
      [2, 'Canción de las vocales', 'https://aba.edu.co/videos/vocales.mp4', 210, 2],
      [3, 'Los colores en la naturaleza', 'https://aba.edu.co/videos/colores.mp4', 150, 3],
      [4, 'Conociendo el círculo y cuadrado', 'https://aba.edu.co/videos/figuras.mp4', 200, 4],
      [5, 'Cómo sumar usando manzanas', 'https://aba.edu.co/videos/sumas.mp4', 300, 5],
      [6, 'El abecedario divertido', 'https://aba.edu.co/videos/abc.mp4', 240, 6],
      [7, 'Restando juguetes', 'https://aba.edu.co/videos/restas.mp4', 220, 7],
      [8, 'Combinando Ma-Me-Mi-Mo-Mu', 'https://aba.edu.co/videos/silabas.mp4', 190, 8],
      [9, 'Mundo animal interactivo', 'https://aba.edu.co/videos/animales.mp4', 260, 9],
      [10, '¿Qué hora es en el reloj?', 'https://aba.edu.co/videos/reloj.mp4', 280, 10],
    ];
    for (const v of videos) insertVideo.run(...v);

    // 9. Evaluaciones
    const insertEvaluacion = db.prepare(
      'INSERT INTO evaluacion (id_evaluacion, titulo, instrucciones, id_saber) VALUES (?, ?, ?, ?)'
    );
    const evaluaciones: [number, string, string, number][] = [
      [1, 'Evaluación de Conteo', 'Selecciona la respuesta correcta con la cantidad', 1],
      [2, 'Evaluación de Vocales', 'Identifica la vocal por la que inicia la imagen', 2],
      [3, 'Evaluación de Colores', 'Selecciona el color correcto', 3],
      [4, 'Evaluación de Figuras', 'Identifica la figura geométrica', 4],
      [5, 'Evaluación de Sumas', 'Resuelve las sumas simples', 5],
      [6, 'Evaluación de Abecedario', 'Encuentra la letra que falta', 6],
      [7, 'Evaluación de Restas', 'Resuelve las restas', 7],
      [8, 'Evaluación de Sílabas', 'Completa la palabra con la sílaba correcta', 8],
      [9, 'Evaluación de Animales', 'Selecciona el animal correcto', 9],
      [10, 'Evaluación del Reloj', 'Indica la hora mostrada', 10],
    ];
    for (const ev of evaluaciones) insertEvaluacion.run(...ev);

    // 10. Respuestas (Preguntas)
    const insertRespuestas = db.prepare(
      'INSERT INTO respuestas (id_respuesta, enunciado_pregunta, opcion_a, opcion_b, opcion_c, id_evaluacion) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const preguntas: [number, string, string, string, string, number][] = [
      [1, '¿Cuántas manzanas hay aquí: 🍎🍎🍎?', '2', '3', '5', 1],
      [2, '¿Con qué vocal empieza Avión?', 'A', 'E', 'O', 2],
      [3, '¿De qué color es un banano maduro?', 'Azul', 'Rojo', 'Amarillo', 3],
      [4, '¿Qué figura no tiene esquinas?', 'Cuadrado', 'Círculo', 'Triángulo', 4],
      [5, '¿Cuánto es 2 + 2?', '3', '4', '5', 5],
      [6, '¿Qué letra sigue después de la A?', 'C', 'B', 'D', 6],
      [7, '¿Cuánto es 5 - 2?', '3', '2', '4', 7],
      [8, 'Completa: ___sa (para decir Mesa)', 'Ma', 'Me', 'Mo', 8],
      [9, '¿Cuál de estos es un animal doméstico?', 'Tigre', 'Perro', 'Tiburón', 9],
      [10, 'Si el minutero está en el 12 y la hora en el 3, ¿qué hora es?', '3:00', '12:00', '6:00', 10],
    ];
    for (const pr of preguntas) insertRespuestas.run(...pr);

    // 11. Respuesta Correcta
    const insertCorrecta = db.prepare(
      'INSERT INTO respuesta_correcta (id_respuesta_correcta, id_respuesta, opcion_correcta, explicacion) VALUES (?, ?, ?, ?)'
    );
    const correctas: [number, number, 'A' | 'B' | 'C', string][] = [
      [1, 1, 'B', 'Hay 3 manzanas en la imagen.'],
      [2, 2, 'A', 'La palabra Avión inicia con la letra A.'],
      [3, 3, 'C', 'El banano es de color amarillo.'],
      [4, 4, 'B', 'El círculo es redondo y no tiene esquinas.'],
      [5, 5, 'B', '2 más 2 es igual a 4.'],
      [6, 6, 'B', 'La segunda letra del abecedario es la B.'],
      [7, 7, 'A', 'Si a 5 le quitas 2 quedan 3.'],
      [8, 8, 'B', 'Con "Me" se forma la palabra Mesa.'],
      [9, 9, 'B', 'El perro vive con las personas en el hogar.'],
      [10, 10, 'A', 'El reloj indica las 3 en punto.'],
    ];
    for (const c of correctas) insertCorrecta.run(...c);

    // 12. Respuesta Incorrecta
    const insertIncorrecta = db.prepare(
      'INSERT INTO respuesta_incorrecta (id_respuesta_incorrecta, id_respuesta, opcion_incorrecta, retroalimentacion) VALUES (?, ?, ?, ?)'
    );
    const incorrectas: [number, number, 'A' | 'B' | 'C', string][] = [
      [1, 1, 'A', 'Vuelve a contar, hay más de 2 manzanas.'],
      [2, 1, 'C', 'Te pasaste, cuenta despacio cada manzana.'],
      [3, 2, 'B', 'Recuerda que Avión empieza con A, no con E.'],
      [4, 3, 'A', 'El azul es como el cielo, prueba con otro color.'],
      [5, 4, 'A', 'El cuadrado tiene 4 esquinas.'],
      [6, 5, 'A', 'Revisa sumando con tus dedos.'],
      [7, 6, 'A', 'La C es la tercera letra, busca la segunda.'],
      [8, 7, 'B', 'Cuenta de nuevo restando dos unidades.'],
      [9, 8, 'A', 'Masa no corresponde con lo pedido, usa Me.'],
      [10, 9, 'A', 'El tigre es un animal salvaje.'],
    ];
    for (const inc of incorrectas) insertIncorrecta.run(...inc);

    // 13. Puntajes
    const estudianteToUsuario = new Map<number, number>(estudiantes.map(([idEst, idUsr]) => [idEst, idUsr]));
    const insertPuntaje = db.prepare(
      'INSERT INTO puntaje (id_puntaje, id_usuario, id_estudiante, id_evaluacion, calificacion, fecha_realizacion) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const puntajes: [number, number, number, number, string][] = [
      [1, 1, 1, 5.00, '2026-08-01 13:30:00'],
      [2, 2, 1, 4.50, '2026-08-01 13:35:00'],
      [3, 3, 3, 5.00, '2026-08-02 14:00:00'],
      [4, 4, 3, 3.80, '2026-08-02 14:10:00'],
      [5, 5, 5, 4.00, '2026-08-03 15:15:00'],
      [6, 6, 5, 5.00, '2026-08-03 15:20:00'],
      [7, 7, 7, 4.20, '2026-08-04 16:00:00'],
      [8, 8, 7, 3.50, '2026-08-04 16:12:00'],
      [9, 9, 9, 5.00, '2026-08-05 13:45:00'],
      [10, 10, 9, 4.80, '2026-08-05 13:50:00'],
    ];
    for (const [idPuntaje, idEst, idEval, calif, fecha] of puntajes) {
      const idUsuario = estudianteToUsuario.get(idEst)!;
      insertPuntaje.run(idPuntaje, idUsuario, idEst, idEval, calif, fecha);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Migra de forma idempotente contraseñas existentes en texto plano o con hashes débiles
 * (MD5/SHA-1/SHA-256) para que ninguna quede expuesta en reposo en la base de datos.
 */
export function migrateLegacyPasswords(): { migratedCount: number } {
  const rows = db
    .prepare('SELECT id_usuario, password_hash FROM usuario')
    .all() as Array<{ id_usuario: number; password_hash: string }>;

  let migratedCount = 0;
  const updateStmt = db.prepare('UPDATE usuario SET password_hash = ? WHERE id_usuario = ?');

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    for (const row of rows) {
      const migrated = migrateLegacyHashValue(row.password_hash);
      if (migrated.migrated) {
        updateStmt.run(migrated.value, row.id_usuario);
        migratedCount++;
      }
    }
    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }

  return { migratedCount };
}
