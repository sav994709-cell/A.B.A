import React, { useState } from 'react';
import { Laptop, Lock, LogOut, ShieldCheck } from 'lucide-react';
import {
  apiFetch,
  getRefreshToken,
  getSessionPersistence,
  setSessionTokens,
  type SessionPersistenceMode,
} from '../lib/api';
import type { AuthUser } from '../types';

interface KeepSignedInPromptProps {
  user: AuthUser;
  onComplete: () => void;
  onCancelToLogin: () => void;
}

/**
 * Pantalla intermedia mostrada inmediatamente después de iniciar sesión con éxito
 * y antes de llegar a la pantalla principal, para decidir si la sesión es persistente o temporal.
 */
export const KeepSignedInPrompt: React.FC<KeepSignedInPromptProps> = ({
  user,
  onComplete,
  onCancelToLogin,
}) => {
  const [selected, setSelected] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function applyPreference(persistent: boolean) {
    setErrorMsg(null);
    setSaving(true);
    try {
      const res = await apiFetch('/api/auth/session-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persistent,
          refresh_token: getRefreshToken(),
        }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.token !== 'string') {
        setErrorMsg(
          data.error ||
            'No pudimos guardar tu preferencia en este momento. Puedes reintentar o continuar solo en esta sesión.'
        );
        return;
      }

      setSessionTokens({
        token: data.token,
        refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
        persistent: Boolean(data.persistent),
      });
      onComplete();
    } catch {
      setErrorMsg(
        'Error de red al guardar tu preferencia. Puedes reintentar o continuar solo durante esta sesión.'
      );
    } finally {
      setSaving(false);
    }
  }

  function handleContinueTemporaryFallback() {
    // Si falla la red al guardar la preferencia, permitimos entrar con la sesión temporal ya emitida
    setErrorMsg(null);
    onComplete();
  }

  return (
    <div className="min-h-screen bg-[#f7f9fb] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl p-8 card-elevation space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#4f46e5]">
              <ShieldCheck className="w-4 h-4" />
              <span>Acceso verificado · {user.email}</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#191c1e]">
              ¿Mantener la sesión iniciada?
            </h1>
            <p className="text-sm text-[#444653]">
              Hola, <strong className="text-[#191c1e]">{user.nombre}</strong>. Elige cómo deseas
              conservar tu sesión antes de entrar a la plataforma.
            </p>
          </div>
        </div>

        <div role="radiogroup" aria-label="Preferencia de duración de sesión" className="space-y-3">
          <button
            type="button"
            role="radio"
            aria-checked={selected === true}
            disabled={saving}
            onClick={() => setSelected(true)}
            className={`w-full text-left rounded-xl border-2 p-4 transition flex items-start gap-3.5 ${
              selected
                ? 'border-[#4f46e5] bg-[#eef2ff]/70'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                selected ? 'bg-[#4f46e5] text-white' : 'bg-[#f2f4f6] text-[#444653]'
              }`}
            >
              <Laptop className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-[#191c1e]">
                Sí, mantener la sesión iniciada
              </p>
              <p className="text-xs text-[#444653] leading-relaxed">
                Seguirás conectado al recargar o reabrir el navegador hasta por 30 días. Úsalo solo
                en tu dispositivo personal.
              </p>
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={selected === false}
            disabled={saving}
            onClick={() => setSelected(false)}
            className={`w-full text-left rounded-xl border-2 p-4 transition flex items-start gap-3.5 ${
              !selected
                ? 'border-[#4f46e5] bg-[#eef2ff]/70'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                !selected ? 'bg-[#4f46e5] text-white' : 'bg-[#f2f4f6] text-[#444653]'
              }`}
            >
              <Lock className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-[#191c1e]">
                No, cerrar al terminar
              </p>
              <p className="text-xs text-[#444653] leading-relaxed">
                Tu sesión será temporal y expirará automáticamente al cerrar esta pestaña o el
                navegador. Recomendado en equipos compartidos.
              </p>
            </div>
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-xs text-[#93000a] space-y-2"
          >
            <p>{errorMsg}</p>
            <button
              type="button"
              onClick={handleContinueTemporaryFallback}
              className="font-semibold underline text-[#1e40af]"
            >
              Continuar solo durante esta sesión
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={saving}
            onClick={onCancelToLogin}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#444653] hover:text-[#ba1a1a] transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Usar otra cuenta</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => applyPreference(selected)}
            className="px-5 py-2.5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-60 text-white text-sm font-semibold transition"
          >
            {saving ? 'Guardando preferencia...' : 'Continuar a la plataforma'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface SessionPreferenceFooterControlProps {
  onLogoutAllDevices: () => void;
}

/**
 * Control discreto para que el usuario cambie su preferencia de persistencia más adelante
 * o cierre sesión en todos sus dispositivos.
 */
export const SessionPreferenceFooterControl: React.FC<SessionPreferenceFooterControlProps> = ({
  onLogoutAllDevices,
}) => {
  const [mode, setMode] = useState<SessionPersistenceMode>(
    () => getSessionPersistence() ?? 'temporary'
  );
  const [busy, setBusy] = useState(false);

  async function handleTogglePersistence() {
    if (busy) return;
    const nextPersistent = mode !== 'persistent';
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/session-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persistent: nextPersistent,
          refresh_token: getRefreshToken(),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.token === 'string') {
        setSessionTokens({
          token: data.token,
          refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
          persistent: Boolean(data.persistent),
        });
        setMode(data.persistent ? 'persistent' : 'temporary');
      }
    } catch {
      // Silencioso en caso de fallo transitorio
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2 text-xs text-[#444653]">
      <button
        type="button"
        disabled={busy}
        onClick={handleTogglePersistence}
        title="Cambiar si la sesión permanece abierta al cerrar el navegador"
        className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-[#4f46e5] hover:text-[#1e40af] transition disabled:opacity-50"
      >
        {mode === 'persistent' ? 'Sesión: Recordada (30 d)' : 'Sesión: Temporal'}
      </button>
      <button
        type="button"
        onClick={onLogoutAllDevices}
        className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-[#ba1a1a] hover:text-[#ba1a1a] transition"
      >
        Cerrar en todos los dispositivos
      </button>
    </div>
  );
};
