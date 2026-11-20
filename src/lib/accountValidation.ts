import type { RoleName } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface AccountProfileDraft {
  nombre: string;
  apellido: string;
  email: string;
  id_grado: number | null;
  especialidad: string;
  current_password: string;
}

export interface AccountProfileFieldErrors {
  nombre?: string;
  apellido?: string;
  email?: string;
  id_grado?: string;
  especialidad?: string;
  current_password?: string;
}

export interface PasswordChangeDraft {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export interface PasswordChangeFieldErrors {
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
}

export function validateAccountProfileDraft(
  draft: AccountProfileDraft,
  context: {
    originalEmail: string;
    role: RoleName;
  }
): AccountProfileFieldErrors {
  const errors: AccountProfileFieldErrors = {};

  const nombre = draft.nombre.trim();
  if (nombre.length < 2 || nombre.length > 80) {
    errors.nombre = 'El nombre debe tener entre 2 y 80 caracteres.';
  }

  const apellido = draft.apellido.trim();
  if (apellido.length < 2 || apellido.length > 80) {
    errors.apellido = 'El apellido debe tener entre 2 y 80 caracteres.';
  }

  const email = draft.email.trim().toLowerCase();
  if (!email) {
    errors.email = 'El correo electrónico es obligatorio.';
  } else if (email.length > 150 || !EMAIL_REGEX.test(email)) {
    errors.email = 'Ingresa un correo electrónico válido (ejemplo: nombre@correo.com).';
  }

  const emailChanged = email.length > 0 && email !== context.originalEmail.trim().toLowerCase();
  if (emailChanged && !draft.current_password) {
    errors.current_password =
      'Para cambiar tu correo electrónico debes confirmar tu contraseña actual.';
  }

  if (context.role === 'Profesor') {
    const especialidad = draft.especialidad.trim();
    if (especialidad.length < 2 || especialidad.length > 100) {
      errors.especialidad = 'La especialidad debe tener entre 2 y 100 caracteres.';
    }
  }

  if (
    (context.role === 'Estudiante' || context.role === 'Profesor') &&
    (draft.id_grado === null || !Number.isInteger(draft.id_grado) || draft.id_grado <= 0)
  ) {
    errors.id_grado = 'Selecciona un grado válido.';
  }

  return errors;
}

export function validatePasswordChangeDraft(
  draft: PasswordChangeDraft
): PasswordChangeFieldErrors {
  const errors: PasswordChangeFieldErrors = {};

  if (!draft.current_password) {
    errors.current_password = 'Debes ingresar tu contraseña actual.';
  }

  if (draft.new_password.length < 6 || draft.new_password.length > 128) {
    errors.new_password = 'La nueva contraseña debe tener entre 6 y 128 caracteres.';
  }

  if (!draft.confirm_password) {
    errors.confirm_password = 'Confirma tu nueva contraseña.';
  } else if (draft.confirm_password !== draft.new_password) {
    errors.confirm_password = 'Las contraseñas nuevas no coinciden.';
  }

  return errors;
}
