import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  User,
  UserPlus,
} from 'lucide-react';
import { apiFetch, setSessionTokens } from '../lib/api';
import type { AuthUser, Grado } from '../types';

interface DevOutboxEmail {
  to: string;
  subject: string;
  resetUrl: string;
  sentAt: string;
}

interface LoginViewProps {
  onSuccess: (user: AuthUser) => void;
  initialResetToken?: string | null;
  onClearResetToken?: () => void;
  sessionNotice?: string | null;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'El correo electrónico es obligatorio.';
  }
  if (trimmed.length > 150 || !EMAIL_REGEX.test(trimmed)) {
    return 'Ingresa un correo electrónico válido (ejemplo: nombre@correo.com).';
  }
  return null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onSuccess,
  initialResetToken = null,
  onClearResetToken,
  sessionNotice = null,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialResetToken ? 'reset' : 'login');

  // Estado de inicio de sesión
  const [email, setEmail] = useState('mateo.r@estudiante.com');
  const [password, setPassword] = useState('aba2026');
  const [showPassword, setShowPassword] = useState(false);

  // Estado de registro
  const [regNombre, setRegNombre] = useState('');
  const [regApellido, setRegApellido] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regEmailTouched, setRegEmailTouched] = useState(false);
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regGrado, setRegGrado] = useState<number>(1);
  const [grados, setGrados] = useState<Grado[]>([]);
  const [registeredUser, setRegisteredUser] = useState<AuthUser | null>(null);
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState<string | null>(null);

  // Estado de recuperación de contraseña
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailTouched, setForgotEmailTouched] = useState(false);
  const [forgotConfirmation, setForgotConfirmation] = useState<string | null>(null);
  const [devOutbox, setDevOutbox] = useState<DevOutboxEmail[]>([]);

  // Estado de restablecimiento con token
  const [activeResetToken, setActiveResetToken] = useState<string | null>(initialResetToken);
  const [tokenValidating, setTokenValidating] = useState<boolean>(Boolean(initialResetToken));
  const [tokenValid, setTokenValid] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regEmailInputRef = useRef<HTMLInputElement>(null);
  const forgotEmailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch('/api/auth/grados')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.grados) && data.grados.length > 0) {
          setGrados(data.grados);
          setRegGrado(data.grados[0].id_grado);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== 'reset' || !activeResetToken) return;
    setTokenValidating(true);
    setTokenValid(false);
    setTokenError(null);
    setResetSuccessMsg(null);
    setError(null);

    apiFetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(activeResetToken)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.valid) {
          setTokenValid(false);
          setTokenError(data.error || 'El enlace de restablecimiento no es válido o ha caducado.');
        } else {
          setTokenValid(true);
        }
      })
      .catch(() => {
        setTokenValid(false);
        setTokenError('No se pudo validar el enlace de restablecimiento.');
      })
      .finally(() => setTokenValidating(false));
  }, [mode, activeResetToken]);

  const regEmailValidationError = validateEmail(regEmail);
  const showRegEmailError = regEmailTouched && regEmailValidationError !== null;
  const isRegisterFormReady =
    regEmailValidationError === null &&
    regNombre.trim().length > 0 &&
    regApellido.trim().length > 0 &&
    regPassword.length >= 6;

  const forgotEmailValidationError = validateEmail(forgotEmail);
  const showForgotEmailError = forgotEmailTouched && forgotEmailValidationError !== null;

  const newPasswordTooShort = newPassword.length > 0 && newPassword.length < 6;
  const newPasswordsMismatch = confirmNewPassword.length > 0 && confirmNewPassword !== newPassword;
  const isResetFormReady = newPassword.length >= 6 && confirmNewPassword === newPassword;

  function switchMode(nextMode: AuthMode) {
    if (mode === 'reset' && nextMode !== 'reset') {
      setActiveResetToken(null);
      onClearResetToken?.();
    }
    setMode(nextMode);
    setError(null);
    setRegisteredUser(null);
    setRegisterSuccessMsg(null);
    setForgotConfirmation(null);
    setResetSuccessMsg(null);
  }

  async function performLogin(targetEmail: string, targetPassword: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        setError(data.error || 'No se pudo iniciar sesión.');
        return;
      }
      if (typeof data.token === 'string') {
        setSessionTokens({
          token: data.token,
          refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
          persistent: Boolean(data.persistent),
        });
      }
      onSuccess(data.user);
    } catch {
      setError('Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performLogin(email, password);
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRegEmailTouched(true);

    const emailErr = validateEmail(regEmail);
    if (emailErr) {
      regEmailInputRef.current?.focus();
      return;
    }

    if (!regNombre.trim() || !regApellido.trim()) {
      setError('Ingresa tu nombre y apellido para crear tu cuenta.');
      return;
    }

    if (regPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: regNombre.trim(),
          apellido: regApellido.trim(),
          email: regEmail.trim().toLowerCase(),
          password: regPassword,
          id_grado: regGrado,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        setError(data.error || 'No se pudo completar el registro.');
        return;
      }
      if (typeof data.token === 'string') {
        setSessionTokens({
          token: data.token,
          refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
          persistent: Boolean(data.persistent),
        });
      }
      setRegisteredUser(data.user as AuthUser);
      setRegisterSuccessMsg(
        data.message || '¡Registro exitoso! Tu cuenta en A.B.A. ha sido creada correctamente.'
      );
    } catch {
      setError('Error de conexión con el servidor al registrar tu cuenta.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setForgotConfirmation(null);
    setForgotEmailTouched(true);

    const emailErr = validateEmail(forgotEmail);
    if (emailErr) {
      forgotEmailInputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo procesar la solicitud.');
        return;
      }
      setForgotConfirmation(data.message);

      // Cargar buzón de pruebas solo si el entorno de desarrollo lo expone
      apiFetch('/api/auth/dev-outbox')
        .then(async (r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && Array.isArray(d.emails)) {
            setDevOutbox(d.emails);
          }
        })
        .catch(() => {});
    } catch {
      setError('Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!activeResetToken) {
      setError('El enlace de restablecimiento no es válido.');
      return;
    }
    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (confirmNewPassword !== newPassword) {
      setError('Las contraseñas ingresadas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: activeResetToken,
          password: newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'TOKEN_USED' || data.code === 'TOKEN_EXPIRED' || data.code === 'INVALID_TOKEN') {
          setTokenValid(false);
          setTokenError(data.error);
        } else {
          setError(data.error || 'No se pudo actualizar la contraseña.');
        }
        return;
      }

      // Limpiar cualquier token local tras el cierre global de sesiones
      setSessionTokens({ token: null });
      setResetSuccessMsg(
        data.message || 'Tu contraseña ha sido actualizada correctamente. Ya puedes iniciar sesión.'
      );
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setError('Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  function openResetFromUrl(resetUrl: string) {
    try {
      const parsed = new URL(resetUrl);
      const token = parsed.searchParams.get('reset_token');
      if (token) {
        setActiveResetToken(token);
        setMode('reset');
        setForgotConfirmation(null);
        setError(null);
      }
    } catch {
      // Ignorar URL malformada
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f9fb] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Panel editorial educativo */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden card-elevation flex flex-col justify-between">
          <div className="p-8 pb-6 space-y-4">
            <div className="flex items-center gap-2.5 text-[#1e40af]">
              <BookOpen className="w-5 h-5" />
              <span className="font-display text-lg font-bold tracking-tight">A.B.A. · Pedagogía Activa</span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#191c1e] leading-tight text-balance">
              Aprende paso a paso con saberes interactivos y retroalimentación inmediata.
            </h1>
            <p className="text-base text-[#444653] leading-relaxed max-w-xl">
              Plataforma escolar organizada por grados desde Transición hasta Quinto, con videos educativos, evaluaciones tipo ABC y seguimiento académico por rol.
            </p>
          </div>
          <div className="relative h-64 sm:h-72 w-full bg-[#f2f4f6] overflow-hidden">
            <img
              src="/src/assets/images/hero_active_pedagogy_1794581670214.jpg"
              alt="Materiales de pedagogía activa sobre escritorio escolar"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Panel de autenticación, registro y recuperación */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-8 card-elevation flex flex-col justify-between">
          <div>
            {(mode === 'login' || mode === 'register') && (
              <div
                role="tablist"
                aria-label="Opciones de acceso a la plataforma"
                className="grid grid-cols-2 gap-1 p-1 bg-[#f2f4f6] rounded-xl mb-6"
              >
                <button
                  type="button"
                  role="tab"
                  id="tab-login"
                  aria-selected={mode === 'login'}
                  aria-controls="panel-login"
                  onClick={() => switchMode('login')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f46e5] ${
                    mode === 'login'
                      ? 'bg-white text-[#1e40af] shadow-sm'
                      : 'text-[#444653] hover:text-[#191c1e]'
                  }`}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-register"
                  aria-selected={mode === 'register'}
                  aria-controls="panel-register"
                  onClick={() => switchMode('register')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4f46e5] ${
                    mode === 'register'
                      ? 'bg-white text-[#1e40af] shadow-sm'
                      : 'text-[#444653] hover:text-[#191c1e]'
                  }`}
                >
                  Crear cuenta
                </button>
              </div>
            )}

            {sessionNotice && !error && (
              <div
                role="status"
                aria-live="polite"
                className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                {sessionNotice}
              </div>
            )}

            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]"
              >
                {error}
              </div>
            )}

            {/* MODO 1: INICIAR SESIÓN */}
            {mode === 'login' && (
              <div role="tabpanel" id="panel-login" aria-labelledby="tab-login">
                <h2 className="font-display text-2xl font-bold text-[#191c1e]">Iniciar sesión</h2>
                <p className="mt-1 text-sm text-[#444653]">
                  Accede con tu correo institucional y contraseña registrada.
                </p>

                <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="login-email" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nombre@aba.edu.co"
                        className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none focus:ring-3 focus:ring-[#4f46e5]/15"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label htmlFor="login-password" className="block text-sm font-semibold text-[#191c1e]">
                        Contraseña
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(email);
                          setForgotEmailTouched(false);
                          switchMode('forgot');
                        }}
                        className="text-xs font-semibold text-[#4f46e5] hover:text-[#1e40af] hover:underline focus-visible:outline-2 focus-visible:outline-[#4f46e5] rounded"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 py-2.5 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none focus:ring-3 focus:ring-[#4f46e5]/15"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-[#4f46e5] rounded"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] active:scale-[0.99] text-white text-sm font-semibold px-4 py-2.5 transition disabled:opacity-60"
                  >
                    <span>{loading ? 'Verificando acceso...' : 'Ingresar a la plataforma'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                <p className="mt-4 text-center text-xs text-[#444653]">
                  ¿Aún no tienes cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="font-semibold text-[#1e40af] hover:underline focus-visible:outline-2 focus-visible:outline-[#4f46e5] rounded"
                  >
                    Regístrate con tu correo
                  </button>
                </p>
              </div>
            )}

            {/* MODO 2: CREAR CUENTA */}
            {mode === 'register' && (
              <div role="tabpanel" id="panel-register" aria-labelledby="tab-register">
                <h2 className="font-display text-2xl font-bold text-[#191c1e]">Crear cuenta</h2>
                <p className="mt-1 text-sm text-[#444653]">
                  Regístrate como estudiante usando tu correo electrónico.
                </p>

                {registeredUser && registerSuccessMsg ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-6 rounded-2xl border border-[#10b981] bg-[#ecfdf5] p-6 space-y-4"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-6 h-6 text-[#10b981] shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h3 className="font-display text-lg font-bold text-[#003d27]">
                          {registerSuccessMsg}
                        </h3>
                        <p className="text-sm text-[#047857]">
                          Bienvenido/a, <strong>{registeredUser.nombre} {registeredUser.apellido}</strong>. Tu correo{' '}
                          <span className="font-semibold">{registeredUser.email}</span> quedó registrado
                          {registeredUser.codigo_estudiantil ? ` con el código ${registeredUser.codigo_estudiantil}` : ''}.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSuccess(registeredUser)}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-sm font-semibold px-4 py-2.5 transition"
                    >
                      <span>Ir a mis Saberes de Aprendizaje</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleRegisterSubmit} noValidate className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="reg-nombre" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                          Nombre <span aria-hidden="true" className="text-[#ba1a1a]">*</span>
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="reg-nombre"
                            type="text"
                            required
                            autoComplete="given-name"
                            value={regNombre}
                            onChange={(e) => setRegNombre(e.target.value)}
                            placeholder="Ej: Laura"
                            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none focus:ring-3 focus:ring-[#4f46e5]/15"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-apellido" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                          Apellido <span aria-hidden="true" className="text-[#ba1a1a]">*</span>
                        </label>
                        <input
                          id="reg-apellido"
                          type="text"
                          required
                          autoComplete="family-name"
                          value={regApellido}
                          onChange={(e) => setRegApellido(e.target.value)}
                          placeholder="Ej: Gómez"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none focus:ring-3 focus:ring-[#4f46e5]/15"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reg-email" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                        Correo electrónico <span aria-hidden="true" className="text-[#ba1a1a]">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          ref={regEmailInputRef}
                          id="reg-email"
                          type="email"
                          required
                          autoComplete="email"
                          aria-required="true"
                          aria-invalid={showRegEmailError}
                          aria-describedby={showRegEmailError ? 'reg-email-error' : 'reg-email-help'}
                          value={regEmail}
                          onChange={(e) => {
                            setRegEmail(e.target.value);
                            if (!regEmailTouched) setRegEmailTouched(true);
                          }}
                          onBlur={() => setRegEmailTouched(true)}
                          placeholder="tucorreo@ejemplo.com"
                          className={`w-full rounded-lg border bg-white pl-10 pr-4 py-2.5 text-sm text-[#191c1e] focus:outline-none focus:ring-3 ${
                            showRegEmailError
                              ? 'border-[#ba1a1a] focus:border-[#ba1a1a] focus:ring-[#ba1a1a]/15'
                              : 'border-slate-300 focus:border-[#4f46e5] focus:ring-[#4f46e5]/15'
                          }`}
                        />
                      </div>
                      {showRegEmailError ? (
                        <p id="reg-email-error" role="alert" className="mt-1.5 text-xs font-medium text-[#ba1a1a]">
                          {regEmailValidationError}
                        </p>
                      ) : (
                        <p id="reg-email-help" className="mt-1.5 text-xs text-[#444653]">
                          Usa un correo válido para identificar tu cuenta de estudiante.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="reg-password" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                          Contraseña <span aria-hidden="true" className="text-[#ba1a1a]">*</span>
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="reg-password"
                            type={showRegPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 py-2.5 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none focus:ring-3 focus:ring-[#4f46e5]/15"
                          />
                          <button
                            type="button"
                            onClick={() => setShowRegPassword((prev) => !prev)}
                            aria-label={showRegPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-[#4f46e5] rounded"
                          >
                            {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-grado" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                          Grado escolar
                        </label>
                        <select
                          id="reg-grado"
                          value={regGrado}
                          onChange={(e) => setRegGrado(Number(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-[#191c1e] focus:border-[#4f46e5] focus:outline-none focus:ring-3 focus:ring-[#4f46e5]/15"
                        >
                          {grados.length === 0 ? (
                            <option value={1}>Transición A (Mañana)</option>
                          ) : (
                            grados.map((g) => (
                              <option key={g.id_grado} value={g.id_grado}>
                                {g.nombre_grado} {g.seccion ? `(${g.seccion})` : ''}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !isRegisterFormReady}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] active:scale-[0.99] text-white text-sm font-semibold px-4 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>{loading ? 'Registrando cuenta...' : 'Registrarme en A.B.A.'}</span>
                    </button>
                  </form>
                )}

                <p className="mt-4 text-center text-xs text-[#444653]">
                  ¿Ya tienes una cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-semibold text-[#1e40af] hover:underline focus-visible:outline-2 focus-visible:outline-[#4f46e5] rounded"
                  >
                    Inicia sesión aquí
                  </button>
                </p>
              </div>
            )}

            {/* MODO 3: SOLICITAR RECUPERACIÓN DE CONTRASEÑA */}
            {mode === 'forgot' && (
              <div>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e40af] hover:underline mb-4 focus-visible:outline-2 focus-visible:outline-[#4f46e5] rounded"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver a iniciar sesión</span>
                </button>

                <h2 className="font-display text-2xl font-bold text-[#191c1e]">Recuperar contraseña</h2>
                <p className="mt-1 text-sm text-[#444653]">
                  Ingresa tu correo electrónico y te enviaremos un enlace de un solo uso para definir una nueva contraseña.
                </p>

                {forgotConfirmation ? (
                  <div className="mt-6 space-y-4">
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-2xl border border-[#10b981] bg-[#ecfdf5] p-5 space-y-2"
                    >
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-[#10b981] shrink-0 mt-0.5" />
                        <p className="text-sm text-[#047857] leading-relaxed">{forgotConfirmation}</p>
                      </div>
                    </div>

                    {devOutbox.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-[#f2f4f6] p-4 space-y-2.5">
                        <p className="text-xs font-semibold text-[#191c1e]">
                          Buzón de pruebas local (sin SMTP configurado)
                        </p>
                        {devOutbox.slice(0, 1).map((mailItem) => (
                          <div key={mailItem.sentAt} className="space-y-2">
                            <p className="text-xs text-[#444653]">
                              Destinatario: <span className="font-medium text-[#191c1e]">{mailItem.to}</span>
                            </p>
                            <button
                              type="button"
                              onClick={() => openResetFromUrl(mailItem.resetUrl)}
                              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-xs font-semibold px-3.5 py-2 transition"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Abrir enlace de restablecimiento</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="w-full min-h-[44px] rounded-lg border border-slate-300 text-[#191c1e] hover:bg-slate-50 text-sm font-semibold px-4 py-2.5 transition"
                    >
                      Regresar al inicio de sesión
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} noValidate className="mt-6 space-y-4">
                    <div>
                      <label htmlFor="forgot-email" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                        Correo electrónico <span aria-hidden="true" className="text-[#ba1a1a]">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          ref={forgotEmailInputRef}
                          id="forgot-email"
                          type="email"
                          required
                          autoComplete="email"
                          aria-required="true"
                          aria-invalid={showForgotEmailError}
                          aria-describedby={showForgotEmailError ? 'forgot-email-error' : undefined}
                          value={forgotEmail}
                          onChange={(e) => {
                            setForgotEmail(e.target.value);
                            if (!forgotEmailTouched) setForgotEmailTouched(true);
                          }}
                          onBlur={() => setForgotEmailTouched(true)}
                          placeholder="nombre@aba.edu.co"
                          className={`w-full rounded-lg border bg-white pl-10 pr-4 py-2.5 text-sm text-[#191c1e] focus:outline-none focus:ring-3 ${
                            showForgotEmailError
                              ? 'border-[#ba1a1a] focus:border-[#ba1a1a] focus:ring-[#ba1a1a]/15'
                              : 'border-slate-300 focus:border-[#4f46e5] focus:ring-[#4f46e5]/15'
                          }`}
                        />
                      </div>
                      {showForgotEmailError && (
                        <p id="forgot-email-error" role="alert" className="mt-1.5 text-xs font-medium text-[#ba1a1a]">
                          {forgotEmailValidationError}
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || forgotEmailValidationError !== null}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold px-4 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>{loading ? 'Procesando solicitud...' : 'Enviar enlace de recuperación'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* MODO 4: DEFINIR NUEVA CONTRASEÑA DESDE ENLACE */}
            {mode === 'reset' && (
              <div>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e40af] hover:underline mb-4 focus-visible:outline-2 focus-visible:outline-[#4f46e5] rounded"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver a iniciar sesión</span>
                </button>

                <h2 className="font-display text-2xl font-bold text-[#191c1e]">Definir nueva contraseña</h2>
                <p className="mt-1 text-sm text-[#444653]">
                  Elige una nueva contraseña segura (mínimo 6 caracteres) para tu cuenta.
                </p>

                {tokenValidating ? (
                  <p className="mt-6 text-sm text-[#444653]">Verificando validez del enlace...</p>
                ) : resetSuccessMsg ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-6 rounded-2xl border border-[#10b981] bg-[#ecfdf5] p-6 space-y-4"
                  >
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-6 h-6 text-[#10b981] shrink-0 mt-0.5" />
                      <p className="text-sm text-[#047857] leading-relaxed">{resetSuccessMsg}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-sm font-semibold px-4 py-2.5 transition"
                    >
                      <span>Iniciar sesión con mi nueva contraseña</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : !tokenValid ? (
                  <div className="mt-6 space-y-4">
                    <div
                      role="alert"
                      className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3.5 text-sm text-[#93000a]"
                    >
                      {tokenError || 'El enlace de restablecimiento no es válido o ha caducado.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="w-full min-h-[44px] rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold px-4 py-2.5 transition"
                    >
                      Solicitar un nuevo enlace
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleResetSubmit} noValidate className="mt-6 space-y-4">
                    <div>
                      <label htmlFor="reset-password" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                        Nueva contraseña <span aria-hidden="true" className="text-[#ba1a1a]">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reset-password"
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          aria-invalid={newPasswordTooShort}
                          aria-describedby="reset-password-help"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className={`w-full rounded-lg border bg-white pl-10 pr-10 py-2.5 text-sm text-[#191c1e] focus:outline-none focus:ring-3 ${
                            newPasswordTooShort
                              ? 'border-[#ba1a1a] focus:border-[#ba1a1a] focus:ring-[#ba1a1a]/15'
                              : 'border-slate-300 focus:border-[#4f46e5] focus:ring-[#4f46e5]/15'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((prev) => !prev)}
                          aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p
                        id="reset-password-help"
                        className={`mt-1.5 text-xs ${newPasswordTooShort ? 'text-[#ba1a1a] font-medium' : 'text-[#444653]'}`}
                      >
                        Debe tener al menos 6 caracteres.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="reset-confirm" className="block text-sm font-semibold text-[#191c1e] mb-1.5">
                        Confirmar contraseña <span aria-hidden="true" className="text-[#ba1a1a]">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reset-confirm"
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          autoComplete="new-password"
                          aria-invalid={newPasswordsMismatch}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Repite tu nueva contraseña"
                          className={`w-full rounded-lg border bg-white pl-10 pr-4 py-2.5 text-sm text-[#191c1e] focus:outline-none focus:ring-3 ${
                            newPasswordsMismatch
                              ? 'border-[#ba1a1a] focus:border-[#ba1a1a] focus:ring-[#ba1a1a]/15'
                              : 'border-slate-300 focus:border-[#4f46e5] focus:ring-[#4f46e5]/15'
                          }`}
                        />
                      </div>
                      {newPasswordsMismatch && (
                        <p role="alert" className="mt-1.5 text-xs font-medium text-[#ba1a1a]">
                          Las contraseñas no coinciden.
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !isResetFormReady}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-semibold px-4 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{loading ? 'Guardando contraseña...' : 'Guardar nueva contraseña'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
