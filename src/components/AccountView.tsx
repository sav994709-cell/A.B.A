import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  Save,
  UserCheck,
} from 'lucide-react';
import { apiFetch, getSessionPersistence, setSessionTokens } from '../lib/api';
import {
  type AccountProfileDraft,
  type AccountProfileFieldErrors,
  type PasswordChangeDraft,
  type PasswordChangeFieldErrors,
  validateAccountProfileDraft,
  validatePasswordChangeDraft,
} from '../lib/accountValidation';
import type { AuthUser, Grado } from '../types';

interface AccountViewProps {
  user: AuthUser;
  onUserUpdated: (updatedUser: AuthUser) => void;
  onSessionExpired?: () => void;
}

function formatCustomizationLabel(value: string | null): string {
  if (!value) return 'Predeterminado';
  return value
    .replace(/^(fondo_|estilo_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const AccountSummaryPanel: React.FC<{ profile: AuthUser }> = ({ profile }) => (
  <section
    aria-labelledby="account-summary-heading"
    className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-5"
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#eef2ff] text-[#1e40af] flex items-center justify-center shrink-0">
        <UserCheck className="w-5 h-5" />
      </div>
      <div>
        <h2
          id="account-summary-heading"
          className="font-display text-lg font-bold text-[#191c1e]"
        >
          Datos almacenados
        </h2>
        <p className="text-xs text-[#444653]">
          Información actual registrada en tu perfil
        </p>
      </div>
    </div>

    <dl className="divide-y divide-slate-100 text-sm">
      <div className="py-3 flex items-baseline justify-between gap-4">
        <dt className="text-[#444653]">Nombre completo</dt>
        <dd className="font-semibold text-[#191c1e] text-right">
          {profile.nombre} {profile.apellido}
        </dd>
      </div>

      <div className="py-3 flex items-baseline justify-between gap-4">
        <dt className="text-[#444653]">Correo electrónico</dt>
        <dd className="font-medium text-[#191c1e] text-right break-all">
          {profile.email}
        </dd>
      </div>

      <div className="py-3 flex items-baseline justify-between gap-4">
        <dt className="text-[#444653]">Rol</dt>
        <dd className="font-medium text-[#191c1e] text-right">{profile.nombre_rol}</dd>
      </div>

      <div className="py-3 flex items-baseline justify-between gap-4">
        <dt className="text-[#444653]">ID de usuario</dt>
        <dd className="font-mono-num text-[#191c1e] text-right">#{profile.id_usuario}</dd>
      </div>

      {(profile.nombre_rol === 'Estudiante' || profile.nombre_rol === 'Profesor') && (
        <div className="py-3 flex items-baseline justify-between gap-4">
          <dt className="text-[#444653]">Grado asignado</dt>
          <dd className="font-medium text-[#191c1e] text-right">
            {profile.nombre_grado ?? 'Sin asignar'}
          </dd>
        </div>
      )}

      {profile.nombre_rol === 'Estudiante' && (
        <div className="py-3 flex items-baseline justify-between gap-4">
          <dt className="text-[#444653]">Código estudiantil</dt>
          <dd className="font-mono-num text-[#191c1e] text-right">
            {profile.codigo_estudiantil ?? 'No asignado'}
          </dd>
        </div>
      )}

      {profile.nombre_rol === 'Profesor' && (
        <div className="py-3 flex items-baseline justify-between gap-4">
          <dt className="text-[#444653]">Especialidad</dt>
          <dd className="font-medium text-[#191c1e] text-right">
            {profile.especialidad ?? 'Sin especificar'}
          </dd>
        </div>
      )}

      {profile.nombre_rol === 'Administrador' && (
        <div className="py-3 flex items-baseline justify-between gap-4">
          <dt className="text-[#444653]">Nivel de acceso</dt>
          <dd className="font-medium text-[#191c1e] text-right">
            {profile.nivel_acceso ?? 'Administrador'}
          </dd>
        </div>
      )}

      <div className="py-3 flex items-baseline justify-between gap-4">
        <dt className="text-[#444653]">Saldo de puntos</dt>
        <dd className="font-semibold text-[#1e40af] tabular-nums text-right">
          {profile.puntos_saldo} pts
        </dd>
      </div>

      <div className="py-3 flex items-baseline justify-between gap-4">
        <dt className="text-[#444653]">Tema visual activo</dt>
        <dd className="text-xs text-[#444653] text-right">
          {formatCustomizationLabel(profile.fondo_activo)} ·{' '}
          {formatCustomizationLabel(profile.estilo_activo)}
        </dd>
      </div>
    </dl>

    <p className="text-xs text-[#444653] bg-[#f7f9fb] border border-slate-200 rounded-xl p-3 leading-relaxed">
      Por integridad académica, tu rol
      {profile.nombre_rol === 'Estudiante' ? ', código estudiantil' : ''}
      {profile.nombre_rol === 'Administrador' ? ' y nivel de acceso' : ''} y saldo de
      puntos son gestionados exclusivamente por la plataforma.
    </p>
  </section>
);

export const AccountView: React.FC<AccountViewProps> = ({
  user,
  onUserUpdated,
  onSessionExpired,
}) => {
  const [profile, setProfile] = useState<AuthUser>(user);
  const [grados, setGrados] = useState<Grado[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Formulario de perfil
  const [draft, setDraft] = useState<AccountProfileDraft>({
    nombre: user.nombre,
    apellido: user.apellido,
    email: user.email,
    id_grado: user.id_grado ?? null,
    especialidad: user.especialidad ?? '',
    current_password: '',
  });
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AccountProfileFieldErrors>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Formulario de contraseña
  const [pwdDraft, setPwdDraft] = useState<PasswordChangeDraft>({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [pwdErrors, setPwdErrors] = useState<PasswordChangeFieldErrors>({});
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwdFeedback, setPwdFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const onUserUpdatedRef = React.useRef(onUserUpdated);
  onUserUpdatedRef.current = onUserUpdated;
  const onSessionExpiredRef = React.useRef(onSessionExpired);
  onSessionExpiredRef.current = onSessionExpired;

  const syncDraftFromProfile = useCallback((nextProfile: AuthUser) => {
    setDraft({
      nombre: nextProfile.nombre,
      apellido: nextProfile.apellido,
      email: nextProfile.email,
      id_grado: nextProfile.id_grado ?? null,
      especialidad: nextProfile.especialidad ?? '',
      current_password: '',
    });
    setFieldErrors({});
  }, []);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch('/api/account');
      const data = await res.json();
      if (res.status === 401) {
        onSessionExpiredRef.current?.();
        throw new Error(data.error || 'Tu sesión ha expirado. Inicia sesión nuevamente.');
      }
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'No se pudieron cargar los datos de tu cuenta.');
      }
      const fetchedUser = data.user as AuthUser;
      setProfile(fetchedUser);
      if (Array.isArray(data.grados)) {
        setGrados(data.grados as Grado[]);
      }
      syncDraftFromProfile(fetchedUser);
      onUserUpdatedRef.current(fetchedUser);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Error de conexión al cargar tu cuenta.'
      );
    } finally {
      setLoading(false);
    }
  }, [syncDraftFromProfile]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const emailChanged =
    draft.email.trim().toLowerCase() !== profile.email.trim().toLowerCase();

  const hasProfileChanges =
    draft.nombre.trim() !== profile.nombre ||
    draft.apellido.trim() !== profile.apellido ||
    emailChanged ||
    ((profile.nombre_rol === 'Estudiante' || profile.nombre_rol === 'Profesor') &&
      draft.id_grado !== profile.id_grado) ||
    (profile.nombre_rol === 'Profesor' &&
      draft.especialidad.trim() !== (profile.especialidad ?? ''));

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileFeedback(null);

    const validationErrors = validateAccountProfileDraft(draft, {
      originalEmail: profile.email,
      role: profile.nombre_rol,
    });
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setProfileFeedback({
        type: 'error',
        text: 'Revisa los campos marcados antes de guardar los cambios.',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {
        nombre: draft.nombre.trim(),
        apellido: draft.apellido.trim(),
        email: draft.email.trim().toLowerCase(),
      };
      if (profile.nombre_rol === 'Estudiante' || profile.nombre_rol === 'Profesor') {
        payload.id_grado = draft.id_grado;
      }
      if (profile.nombre_rol === 'Profesor') {
        payload.especialidad = draft.especialidad.trim();
      }
      if (emailChanged) {
        payload.current_password = draft.current_password;
      }

      const res = await apiFetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 401) {
        onSessionExpired?.();
        return;
      }

      if (!res.ok || !data.user) {
        if (
          data.code === 'INVALID_CURRENT_PASSWORD' ||
          data.code === 'PASSWORD_REQUIRED_FOR_EMAIL'
        ) {
          setFieldErrors((prev) => ({ ...prev, current_password: data.error }));
        } else if (data.code === 'EMAIL_TAKEN' || data.code === 'INVALID_EMAIL') {
          setFieldErrors((prev) => ({ ...prev, email: data.error }));
        }
        setProfileFeedback({
          type: 'error',
          text: data.error || 'No se pudieron guardar los cambios.',
        });
        return;
      }

      const updatedUser = data.user as AuthUser;
      setProfile(updatedUser);
      syncDraftFromProfile(updatedUser);
      setShowEmailPassword(false);
      onUserUpdated(updatedUser);
      setProfileFeedback({
        type: 'success',
        text: data.message || 'Tus datos de cuenta se actualizaron correctamente.',
      });
    } catch {
      setProfileFeedback({
        type: 'error',
        text: 'Error de conexión con el servidor al intentar guardar tus datos.',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwdFeedback(null);

    const validationErrors = validatePasswordChangeDraft(pwdDraft);
    setPwdErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setPwdFeedback({
        type: 'error',
        text: 'Corrige los campos de contraseña antes de continuar.',
      });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiFetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...pwdDraft,
          persistent: getSessionPersistence() === 'persistent',
        }),
      });
      const data = await res.json();

      if (res.status === 401) {
        onSessionExpired?.();
        return;
      }

      if (!res.ok) {
        if (data.code === 'INVALID_CURRENT_PASSWORD') {
          setPwdErrors((prev) => ({ ...prev, current_password: data.error }));
        }
        setPwdFeedback({
          type: 'error',
          text: data.error || 'No se pudo actualizar la contraseña.',
        });
        return;
      }

      if (typeof data.token === 'string') {
        setSessionTokens({
          token: data.token,
          refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
          persistent: Boolean(data.persistent),
        });
      }

      setPwdDraft({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setPwdErrors({});
      setPwdFeedback({
        type: 'success',
        text: data.message || 'Tu contraseña ha sido actualizada correctamente.',
      });
    } catch {
      setPwdFeedback({
        type: 'error',
        text: 'Error de conexión al intentar actualizar tu contraseña.',
      });
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-[#444653]" role="status">
        Cargando datos de tu cuenta...
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 card-elevation"
      >
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 text-[#ba1a1a]">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-[#191c1e]">
            No pudimos cargar tu cuenta
          </h2>
          <p className="text-sm text-[#444653]">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAccount()}
          className="aba-primary-btn inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold transition"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reintentar</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#4f46e5] tabular-nums">
          {profile.nombre_rol} · Cuenta #{profile.id_usuario} · {profile.puntos_saldo} pts
        </p>
        <h1 className="font-display text-3xl font-bold text-[#191c1e]">
          Mi Cuenta y Perfil
        </h1>
        <p className="text-sm text-[#444653] max-w-2xl">
          Consulta la información almacenada de tu cuenta y actualiza tus datos personales o tu
          contraseña cuando lo necesites.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Resumen de datos almacenados */}
        <AccountSummaryPanel profile={profile} />

        {/* Formularios de edición */}
        <div className="lg:col-span-7 space-y-6">
          <section
            aria-labelledby="account-edit-heading"
            className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-5"
          >
            <div>
              <h2
                id="account-edit-heading"
                className="font-display text-lg font-bold text-[#191c1e]"
              >
                Editar datos de cuenta
              </h2>
              <p className="text-xs text-[#444653]">
                Actualiza tu información personal. Si modificas tu correo electrónico deberás
                confirmar tu contraseña actual.
              </p>
            </div>

            <form onSubmit={handleProfileSubmit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="account-nombre"
                    className="block text-xs font-semibold text-[#191c1e] mb-1.5"
                  >
                    Nombre
                  </label>
                  <input
                    id="account-nombre"
                    type="text"
                    value={draft.nombre}
                    disabled={savingProfile}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraft((prev) => ({ ...prev, nombre: val }));
                      if (fieldErrors.nombre) {
                        setFieldErrors((prev) => ({ ...prev, nombre: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.nombre)}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 ${
                      fieldErrors.nombre
                        ? 'border-[#ba1a1a] bg-red-50/40'
                        : 'border-slate-300 bg-white'
                    }`}
                  />
                  {fieldErrors.nombre && (
                    <p className="mt-1 text-xs text-[#ba1a1a]">{fieldErrors.nombre}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="account-apellido"
                    className="block text-xs font-semibold text-[#191c1e] mb-1.5"
                  >
                    Apellido
                  </label>
                  <input
                    id="account-apellido"
                    type="text"
                    value={draft.apellido}
                    disabled={savingProfile}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraft((prev) => ({ ...prev, apellido: val }));
                      if (fieldErrors.apellido) {
                        setFieldErrors((prev) => ({ ...prev, apellido: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.apellido)}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 ${
                      fieldErrors.apellido
                        ? 'border-[#ba1a1a] bg-red-50/40'
                        : 'border-slate-300 bg-white'
                    }`}
                  />
                  {fieldErrors.apellido && (
                    <p className="mt-1 text-xs text-[#ba1a1a]">{fieldErrors.apellido}</p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="account-email"
                  className="block text-xs font-semibold text-[#191c1e] mb-1.5"
                >
                  Correo electrónico
                </label>
                <input
                  id="account-email"
                  type="email"
                  value={draft.email}
                  disabled={savingProfile}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((prev) => ({ ...prev, email: val }));
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 ${
                    fieldErrors.email
                      ? 'border-[#ba1a1a] bg-red-50/40'
                      : 'border-slate-300 bg-white'
                  }`}
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-[#ba1a1a]">{fieldErrors.email}</p>
                )}
              </div>

              {emailChanged && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-2.5">
                  <div className="flex items-start gap-2 text-xs text-amber-900">
                    <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <span>
                      Estás cambiando tu correo electrónico de inicio de sesión. Por seguridad,
                      ingresa tu contraseña actual para confirmar este cambio.
                    </span>
                  </div>
                  <div>
                    <label
                      htmlFor="account-email-confirm-password"
                      className="block text-xs font-semibold text-[#191c1e] mb-1"
                    >
                      Contraseña actual
                    </label>
                    <div className="relative">
                      <input
                        id="account-email-confirm-password"
                        type={showEmailPassword ? 'text' : 'password'}
                        value={draft.current_password}
                        disabled={savingProfile}
                        placeholder="Ingresa tu contraseña actual"
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraft((prev) => ({ ...prev, current_password: val }));
                          if (fieldErrors.current_password) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              current_password: undefined,
                            }));
                          }
                        }}
                        aria-invalid={Boolean(fieldErrors.current_password)}
                        className={`w-full pr-10 px-3.5 py-2.5 rounded-lg border text-sm text-[#191c1e] bg-white focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 ${
                          fieldErrors.current_password ? 'border-[#ba1a1a]' : 'border-slate-300'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmailPassword((v) => !v)}
                        aria-label={
                          showEmailPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#191c1e]"
                      >
                        {showEmailPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {fieldErrors.current_password && (
                      <p className="mt-1 text-xs text-[#ba1a1a]">
                        {fieldErrors.current_password}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {(profile.nombre_rol === 'Estudiante' || profile.nombre_rol === 'Profesor') && (
                <div>
                  <label
                    htmlFor="account-grado"
                    className="block text-xs font-semibold text-[#191c1e] mb-1.5"
                  >
                    Grado asignado
                  </label>
                  <select
                    id="account-grado"
                    value={draft.id_grado ?? ''}
                    disabled={savingProfile}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraft((prev) => ({
                        ...prev,
                        id_grado: Number.isInteger(val) && val > 0 ? val : null,
                      }));
                      if (fieldErrors.id_grado) {
                        setFieldErrors((prev) => ({ ...prev, id_grado: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.id_grado)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20"
                  >
                    {grados.map((g) => (
                      <option key={g.id_grado} value={g.id_grado}>
                        {g.seccion ? `${g.nombre_grado} (${g.seccion})` : g.nombre_grado}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.id_grado && (
                    <p className="mt-1 text-xs text-[#ba1a1a]">{fieldErrors.id_grado}</p>
                  )}
                </div>
              )}

              {profile.nombre_rol === 'Profesor' && (
                <div>
                  <label
                    htmlFor="account-especialidad"
                    className="block text-xs font-semibold text-[#191c1e] mb-1.5"
                  >
                    Especialidad docente
                  </label>
                  <input
                    id="account-especialidad"
                    type="text"
                    value={draft.especialidad}
                    disabled={savingProfile}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraft((prev) => ({ ...prev, especialidad: val }));
                      if (fieldErrors.especialidad) {
                        setFieldErrors((prev) => ({ ...prev, especialidad: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.especialidad)}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 ${
                      fieldErrors.especialidad
                        ? 'border-[#ba1a1a] bg-red-50/40'
                        : 'border-slate-300 bg-white'
                    }`}
                  />
                  {fieldErrors.especialidad && (
                    <p className="mt-1 text-xs text-[#ba1a1a]">{fieldErrors.especialidad}</p>
                  )}
                </div>
              )}

              {profileFeedback && (
                <div
                  role={profileFeedback.type === 'error' ? 'alert' : 'status'}
                  className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium ${
                    profileFeedback.type === 'error'
                      ? 'bg-red-50 border-red-200 text-[#ba1a1a]'
                      : 'bg-emerald-50 border-emerald-200 text-[#047857]'
                  }`}
                >
                  {profileFeedback.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{profileFeedback.text}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="aba-primary-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-60 text-white text-sm font-semibold transition"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingProfile ? 'Guardando cambios...' : 'Guardar cambios'}</span>
                </button>
                <button
                  type="button"
                  disabled={savingProfile || !hasProfileChanges}
                  onClick={() => {
                    syncDraftFromProfile(profile);
                    setProfileFeedback(null);
                    setShowEmailPassword(false);
                  }}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-[#444653] hover:text-[#191c1e] hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Descartar cambios
                </button>
              </div>
            </form>
          </section>

          {/* Sección de cambio de contraseña */}
          <section
            aria-labelledby="account-password-heading"
            className="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#f2f4f6] text-[#444653] flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h2
                    id="account-password-heading"
                    className="font-display text-lg font-bold text-[#191c1e]"
                  >
                    Cambiar contraseña
                  </h2>
                  <p className="text-xs text-[#444653]">
                    Al actualizar tu contraseña se cerrarán automáticamente otras sesiones abiertas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="text-xs font-medium text-[#4f46e5] hover:underline whitespace-nowrap shrink-0"
              >
                {showPasswords ? 'Ocultar claves' : 'Mostrar claves'}
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="pwd-current"
                  className="block text-xs font-semibold text-[#191c1e] mb-1.5"
                >
                  Contraseña actual
                </label>
                <input
                  id="pwd-current"
                  type={showPasswords ? 'text' : 'password'}
                  value={pwdDraft.current_password}
                  disabled={savingPassword}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPwdDraft((prev) => ({ ...prev, current_password: val }));
                    if (pwdErrors.current_password) {
                      setPwdErrors((prev) => ({ ...prev, current_password: undefined }));
                    }
                  }}
                  aria-invalid={Boolean(pwdErrors.current_password)}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 ${
                    pwdErrors.current_password
                      ? 'border-[#ba1a1a] bg-red-50/40'
                      : 'border-slate-300 bg-white'
                  }`}
                />
                {pwdErrors.current_password && (
                  <p className="mt-1 text-xs text-[#ba1a1a]">{pwdErrors.current_password}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="pwd-new"
                    className="block text-xs font-semibold text-[#191c1e] mb-1.5"
                  >
                    Nueva contraseña
                  </label>
                  <input
                    id="pwd-new"
                    type={showPasswords ? 'text' : 'password'}
                    value={pwdDraft.new_password}
                    disabled={savingPassword}
                    placeholder="Mínimo 6 caracteres"
                    onChange={(e) => {
                      const val = e.target.value;
                      setPwdDraft((prev) => ({ ...prev, new_password: val }));
                      if (pwdErrors.new_password) {
                        setPwdErrors((prev) => ({ ...prev, new_password: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(pwdErrors.new_password)}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 ${
                      pwdErrors.new_password
                        ? 'border-[#ba1a1a] bg-red-50/40'
                        : 'border-slate-300 bg-white'
                    }`}
                  />
                  {pwdErrors.new_password && (
                    <p className="mt-1 text-xs text-[#ba1a1a]">{pwdErrors.new_password}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="pwd-confirm"
                    className="block text-xs font-semibold text-[#191c1e] mb-1.5"
                  >
                    Confirmar nueva contraseña
                  </label>
                  <input
                    id="pwd-confirm"
                    type={showPasswords ? 'text' : 'password'}
                    value={pwdDraft.confirm_password}
                    disabled={savingPassword}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPwdDraft((prev) => ({ ...prev, confirm_password: val }));
                      if (pwdErrors.confirm_password) {
                        setPwdErrors((prev) => ({ ...prev, confirm_password: undefined }));
                      }
                    }}
                    aria-invalid={Boolean(pwdErrors.confirm_password)}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-[#191c1e] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 ${
                      pwdErrors.confirm_password
                        ? 'border-[#ba1a1a] bg-red-50/40'
                        : 'border-slate-300 bg-white'
                    }`}
                  />
                  {pwdErrors.confirm_password && (
                    <p className="mt-1 text-xs text-[#ba1a1a]">{pwdErrors.confirm_password}</p>
                  )}
                </div>
              </div>

              {pwdFeedback && (
                <div
                  role={pwdFeedback.type === 'error' ? 'alert' : 'status'}
                  className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium ${
                    pwdFeedback.type === 'error'
                      ? 'bg-red-50 border-red-200 text-[#ba1a1a]'
                      : 'bg-emerald-50 border-emerald-200 text-[#047857]'
                  }`}
                >
                  {pwdFeedback.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{pwdFeedback.text}</span>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-[#191c1e] text-sm font-semibold transition"
                >
                  <KeyRound className="w-4 h-4 text-[#4f46e5]" />
                  <span>
                    {savingPassword ? 'Actualizando contraseña...' : 'Actualizar contraseña'}
                  </span>
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};
