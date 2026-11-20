import { type AuthUser, loadUserProfile } from './auth.ts';
import { db } from './db.ts';
import { hashPassword, verifyPassword } from './passwordCrypto.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface GradoOption {
  id_grado: number;
  nombre_grado: string;
  seccion: string | null;
}

export interface AccountDetailsResult {
  user: AuthUser;
  grados: GradoOption[];
}

export type AccountUpdateResult =
  | {
      ok: true;
      emailChanged: boolean;
      user: AuthUser;
    }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
    };

export type PasswordUpdateResult =
  | {
      ok: true;
      sessionVersion: number;
    }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
    };

export function getAccountDetails(userId: number): AccountDetailsResult | null {
  const user = loadUserProfile(userId);
  if (!user) return null;

  const grados = db
    .prepare('SELECT id_grado, nombre_grado, seccion FROM grado ORDER BY id_grado ASC')
    .all() as unknown as GradoOption[];

  return { user, grados };
}

export function updateOwnAccount(params: {
  userId: number;
  nombre: unknown;
  apellido: unknown;
  email: unknown;
  id_grado?: unknown;
  especialidad?: unknown;
  current_password?: unknown;
}): AccountUpdateResult {
  const nombre = typeof params.nombre === 'string' ? params.nombre.trim() : '';
  const apellido = typeof params.apellido === 'string' ? params.apellido.trim() : '';
  const email = typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';
  const currentPassword =
    typeof params.current_password === 'string' ? params.current_password : '';

  if (nombre.length < 2 || nombre.length > 80) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_NAME',
      error: 'El nombre debe tener entre 2 y 80 caracteres.',
    };
  }

  if (apellido.length < 2 || apellido.length > 80) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_LASTNAME',
      error: 'El apellido debe tener entre 2 y 80 caracteres.',
    };
  }

  if (!email) {
    return {
      ok: false,
      status: 400,
      code: 'EMAIL_REQUIRED',
      error: 'El correo electrónico es obligatorio.',
    };
  }

  if (email.length > 150 || !EMAIL_REGEX.test(email)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_EMAIL',
      error: 'Ingresa un correo electrónico válido (ejemplo: nombre@correo.com).',
    };
  }

  const currentRow = db
    .prepare('SELECT id_usuario, email, password_hash FROM usuario WHERE id_usuario = ?')
    .get(params.userId) as
    | { id_usuario: number; email: string; password_hash: string }
    | undefined;

  const currentProfile = loadUserProfile(params.userId);
  if (!currentRow || !currentProfile) {
    return {
      ok: false,
      status: 404,
      code: 'USER_NOT_FOUND',
      error: 'No se encontró la cuenta del usuario.',
    };
  }

  const emailChanged = email !== currentRow.email.trim().toLowerCase();
  let upgradedPasswordHash: string | undefined;

  if (emailChanged) {
    if (!currentPassword) {
      return {
        ok: false,
        status: 400,
        code: 'PASSWORD_REQUIRED_FOR_EMAIL',
        error: 'Para cambiar tu correo electrónico debes confirmar tu contraseña actual.',
      };
    }

    const verified = verifyPassword(currentPassword, currentRow.password_hash);
    if (!verified.valid) {
      return {
        ok: false,
        status: 403,
        code: 'INVALID_CURRENT_PASSWORD',
        error: 'La contraseña actual no es correcta.',
      };
    }
    if (verified.needsUpgrade && verified.upgradedHash) {
      upgradedPasswordHash = verified.upgradedHash;
    }

    const duplicate = db
      .prepare('SELECT id_usuario FROM usuario WHERE LOWER(email) = ? AND id_usuario != ?')
      .get(email, params.userId) as { id_usuario: number } | undefined;

    if (duplicate) {
      return {
        ok: false,
        status: 409,
        code: 'EMAIL_TAKEN',
        error: 'Este correo electrónico ya está registrado en otra cuenta.',
      };
    }
  }

  let validatedGradoId: number | null = null;
  if (
    (currentProfile.nombre_rol === 'Estudiante' || currentProfile.nombre_rol === 'Profesor') &&
    params.id_grado !== undefined &&
    params.id_grado !== null &&
    params.id_grado !== ''
  ) {
    const parsedGrado = Number(params.id_grado);
    if (!Number.isInteger(parsedGrado) || parsedGrado <= 0) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_GRADO',
        error: 'El grado seleccionado no es válido.',
      };
    }
    const gradoExists = db
      .prepare('SELECT id_grado FROM grado WHERE id_grado = ?')
      .get(parsedGrado);
    if (!gradoExists) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_GRADO',
        error: 'El grado seleccionado no existe en la plataforma.',
      };
    }
    validatedGradoId = parsedGrado;
  }

  let validatedEspecialidad: string | null = null;
  if (currentProfile.nombre_rol === 'Profesor' && params.especialidad !== undefined) {
    if (typeof params.especialidad !== 'string') {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ESPECIALIDAD',
        error: 'La especialidad ingresada no es válida.',
      };
    }
    const trimmedEsp = params.especialidad.trim();
    if (trimmedEsp.length < 2 || trimmedEsp.length > 100) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_ESPECIALIDAD',
        error: 'La especialidad debe tener entre 2 y 100 caracteres.',
      };
    }
    validatedEspecialidad = trimmedEsp;
  }

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    if (upgradedPasswordHash) {
      db.prepare(
        'UPDATE usuario SET nombre = ?, apellido = ?, email = ?, password_hash = ? WHERE id_usuario = ?'
      ).run(nombre, apellido, email, upgradedPasswordHash, params.userId);
    } else {
      db.prepare('UPDATE usuario SET nombre = ?, apellido = ?, email = ? WHERE id_usuario = ?').run(
        nombre,
        apellido,
        email,
        params.userId
      );
    }

    if (currentProfile.nombre_rol === 'Estudiante' && validatedGradoId !== null) {
      db.prepare('UPDATE estudiante SET id_grado = ? WHERE id_usuario = ?').run(
        validatedGradoId,
        params.userId
      );
    }

    if (currentProfile.nombre_rol === 'Profesor') {
      if (validatedGradoId !== null && validatedEspecialidad !== null) {
        db.prepare('UPDATE profesor SET id_grado = ?, especialidad = ? WHERE id_usuario = ?').run(
          validatedGradoId,
          validatedEspecialidad,
          params.userId
        );
      } else if (validatedGradoId !== null) {
        db.prepare('UPDATE profesor SET id_grado = ? WHERE id_usuario = ?').run(
          validatedGradoId,
          params.userId
        );
      } else if (validatedEspecialidad !== null) {
        db.prepare('UPDATE profesor SET especialidad = ? WHERE id_usuario = ?').run(
          validatedEspecialidad,
          params.userId
        );
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      return {
        ok: false,
        status: 409,
        code: 'EMAIL_TAKEN',
        error: 'Este correo electrónico ya está registrado en otra cuenta.',
      };
    }
    throw err;
  }

  const updatedUser = loadUserProfile(params.userId);
  if (!updatedUser) {
    return {
      ok: false,
      status: 500,
      code: 'PROFILE_LOAD_ERROR',
      error: 'No se pudo recargar el perfil actualizado.',
    };
  }

  return {
    ok: true,
    emailChanged,
    user: updatedUser,
  };
}

export function updateOwnPassword(params: {
  userId: number;
  current_password: unknown;
  new_password: unknown;
  confirm_password: unknown;
}): PasswordUpdateResult {
  const currentPassword =
    typeof params.current_password === 'string' ? params.current_password : '';
  const newPassword = typeof params.new_password === 'string' ? params.new_password : '';
  const confirmPassword =
    typeof params.confirm_password === 'string' ? params.confirm_password : '';

  if (!currentPassword) {
    return {
      ok: false,
      status: 400,
      code: 'CURRENT_PASSWORD_REQUIRED',
      error: 'Debes ingresar tu contraseña actual.',
    };
  }

  if (newPassword.length < 6 || newPassword.length > 128) {
    return {
      ok: false,
      status: 400,
      code: 'WEAK_PASSWORD',
      error: 'La nueva contraseña debe tener entre 6 y 128 caracteres.',
    };
  }

  if (confirmPassword !== newPassword) {
    return {
      ok: false,
      status: 400,
      code: 'PASSWORD_MISMATCH',
      error: 'La confirmación de la nueva contraseña no coincide.',
    };
  }

  const row = db
    .prepare('SELECT id_usuario, password_hash FROM usuario WHERE id_usuario = ?')
    .get(params.userId) as { id_usuario: number; password_hash: string } | undefined;

  if (!row) {
    return {
      ok: false,
      status: 404,
      code: 'USER_NOT_FOUND',
      error: 'No se encontró la cuenta del usuario.',
    };
  }

  const verifiedCurrent = verifyPassword(currentPassword, row.password_hash);
  if (!verifiedCurrent.valid) {
    return {
      ok: false,
      status: 403,
      code: 'INVALID_CURRENT_PASSWORD',
      error: 'La contraseña actual no es correcta.',
    };
  }

  const newHash = hashPassword(newPassword);
  const now = Date.now();
  let newSessionVersion = 1;

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    db.prepare(
      'UPDATE usuario SET password_hash = ?, session_version = session_version + 1 WHERE id_usuario = ?'
    ).run(newHash, params.userId);

    db.prepare(
      'UPDATE refresh_token SET revoked_at = ? WHERE id_usuario = ? AND revoked_at IS NULL'
    ).run(now, params.userId);

    const updated = db
      .prepare('SELECT session_version FROM usuario WHERE id_usuario = ?')
      .get(params.userId) as { session_version: number } | undefined;
    newSessionVersion = updated?.session_version ?? 1;

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar
    }
    throw err;
  }

  return {
    ok: true,
    sessionVersion: newSessionVersion,
  };
}
