import { useCallback, useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { apiFetch, setSessionToken } from './lib/api';
import type { AuthUser } from './types';
import { LoginView } from './components/LoginView';
import { SaberesView } from './components/SaberesView';
import { VideoPlayerView } from './components/VideoPlayerView';
import { EvaluacionView } from './components/EvaluacionView';
import { DashboardView } from './components/DashboardView';
import { ProfesorView } from './components/ProfesorView';
import { AdminView } from './components/AdminView';
import { LaravelDeliverableView } from './components/LaravelDeliverableView';
import { TiendaView } from './components/TiendaView';
import { DuelosView } from './components/DuelosView';
import { AccountView } from './components/AccountView';
import { TimeHistoryView } from './components/TimeHistoryView';
import { SalasView } from './components/SalasView';
import { GlobalSessionTimer } from './components/TimeModuleWidgets';
import { TimeActivitySync, useTimeModuleActions } from './context/TimeModuleContext';
import {
  SessionLimitFooterControl,
  SessionLimitProvider,
  SessionLimitSetupModal,
  SessionLimitWarningBanner,
} from './components/SessionLimitWidgets';
import { saveStoredSessionLimit } from './lib/sessionLimit';
import { getRefreshToken } from './lib/api';
import {
  KeepSignedInPrompt,
  SessionPreferenceFooterControl,
} from './components/KeepSignedInPrompt';
import { flushClientTelemetry, trackUiEvent } from './lib/telemetryClient';

type ActiveRoute =
  | { page: 'saberes'; saberId: number | null }
  | { page: 'videos'; videoId: number | null }
  | { page: 'evaluacion'; evaluacionId: number }
  | { page: 'progreso' }
  | { page: 'tiempo' }
  | { page: 'salas' }
  | { page: 'duelos' }
  | { page: 'tienda' }
  | { page: 'cuenta' }
  | { page: 'profesor' }
  | { page: 'admin' }
  | { page: 'laravel' };

export default function App() {
  const { finalizeTrackedSession } = useTimeModuleActions();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingLoginUser, setPendingLoginUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [route, setRoute] = useState<ActiveRoute>({ page: 'saberes', saberId: null });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [sessionLimitNotice, setSessionLimitNotice] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('reset_token');
    return t && t.trim() ? t.trim() : null;
  });
  const [inviteRoomCode, setInviteRoomCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('sala');
    return s && s.trim() ? s.trim().toUpperCase() : null;
  });

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(async (r) => {
        if (!r.ok) {
          setSessionToken(null);
          return null;
        }
        const d = await r.json();
        return d.user as AuthUser;
      })
      .then((u) => {
        if (u) setUser(u);
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    trackUiEvent('ui.page_view', {
      entityType: 'vista',
      entityId: route.page,
      metadata: {
        page: route.page,
      },
    });
  }, [user, route]);

  useEffect(() => {
    const onUnload = () => {
      void flushClientTelemetry();
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  async function handleLogout() {
    await finalizeTrackedSession();
    saveStoredSessionLimit(null);
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: getRefreshToken() }),
    }).catch(() => {});
    setSessionToken(null);
    setPendingLoginUser(null);
    setUser(null);
    setJustLoggedIn(false);
    setSessionLimitNotice(null);
    setRoute({ page: 'saberes', saberId: null });
    setMobileMenuOpen(false);
  }

  async function handleLogoutAllDevices() {
    await finalizeTrackedSession();
    saveStoredSessionLimit(null);
    await apiFetch('/api/auth/logout-all', { method: 'POST' }).catch(() => {});
    setSessionToken(null);
    setPendingLoginUser(null);
    setUser(null);
    setJustLoggedIn(false);
    setSessionLimitNotice('Se cerraron todas tus sesiones activas en todos los dispositivos.');
    setRoute({ page: 'saberes', saberId: null });
    setMobileMenuOpen(false);
  }

  async function handleSessionLimitExpired() {
    await finalizeTrackedSession();
    saveStoredSessionLimit(null);
    await apiFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: getRefreshToken() }),
    }).catch(() => {});
    setSessionToken(null);
    setPendingLoginUser(null);
    setUser(null);
    setJustLoggedIn(false);
    setSessionLimitNotice(
      'Tu sesión se cerró automáticamente porque se cumplió el tiempo límite configurado.'
    );
    setRoute({ page: 'saberes', saberId: null });
    setMobileMenuOpen(false);
  }

  const handleSessionExpired = useCallback(() => {
    saveStoredSessionLimit(null);
    setSessionToken(null);
    setPendingLoginUser(null);
    setUser(null);
    setJustLoggedIn(false);
    setRoute({ page: 'saberes', saberId: null });
  }, []);

  const handleAutoOpenHandled = useCallback(() => {
    setJustLoggedIn(false);
  }, []);

  function enterMainWorkspace(loggedUser: AuthUser) {
    setSessionLimitNotice(null);
    setJustLoggedIn(true);
    setPendingLoginUser(null);
    setUser(loggedUser);
    if (inviteRoomCode) {
      setRoute({ page: 'salas' });
    } else if (loggedUser.nombre_rol === 'Administrador') {
      setRoute({ page: 'admin' });
    } else if (loggedUser.nombre_rol === 'Profesor') {
      setRoute({ page: 'profesor' });
    } else {
      setRoute({ page: 'saberes', saberId: null });
    }
  }

  function handleLoginSuccess(loggedUser: AuthUser) {
    setSessionLimitNotice(null);
    setPendingLoginUser(loggedUser);
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#f7f9fb] flex items-center justify-center text-sm text-[#444653]">
        Cargando Plataforma A.B.A....
      </div>
    );
  }

  if (pendingLoginUser) {
    return (
      <KeepSignedInPrompt
        user={pendingLoginUser}
        onComplete={() => enterMainWorkspace(pendingLoginUser)}
        onCancelToLogin={handleLogout}
      />
    );
  }

  if (resetToken) {
    return (
      <LoginView
        initialResetToken={resetToken}
        onClearResetToken={() => {
          setResetToken(null);
          const url = new URL(window.location.href);
          url.searchParams.delete('reset_token');
          window.history.replaceState({}, '', url.pathname + url.search);
        }}
        onSuccess={(loggedUser) => {
          setResetToken(null);
          const url = new URL(window.location.href);
          url.searchParams.delete('reset_token');
          window.history.replaceState({}, '', url.pathname + url.search);
          handleLoginSuccess(loggedUser);
        }}
      />
    );
  }

  if (!user) {
    return <LoginView onSuccess={handleLoginSuccess} sessionNotice={sessionLimitNotice} />;
  }

  const navItems: Array<{ label: string; active: boolean; onClick: () => void }> = [
    {
      label: 'Saberes',
      active: route.page === 'saberes' || route.page === 'evaluacion',
      onClick: () => setRoute({ page: 'saberes', saberId: null }),
    },
    {
      label: 'Videos',
      active: route.page === 'videos',
      onClick: () => setRoute({ page: 'videos', videoId: null }),
    },
    {
      label: 'Progreso',
      active: route.page === 'progreso',
      onClick: () => setRoute({ page: 'progreso' }),
    },
    {
      label: 'Tiempo',
      active: route.page === 'tiempo',
      onClick: () => setRoute({ page: 'tiempo' }),
    },
    {
      label: 'Salas',
      active: route.page === 'salas',
      onClick: () => setRoute({ page: 'salas' }),
    },
    {
      label: 'Duelos',
      active: route.page === 'duelos',
      onClick: () => setRoute({ page: 'duelos' }),
    },
    {
      label: 'Tienda',
      active: route.page === 'tienda',
      onClick: () => setRoute({ page: 'tienda' }),
    },
    {
      label: 'Cuenta',
      active: route.page === 'cuenta',
      onClick: () => setRoute({ page: 'cuenta' }),
    },
  ];

  if (user.nombre_rol === 'Profesor' || user.nombre_rol === 'Administrador') {
    navItems.push({
      label: 'Docente',
      active: route.page === 'profesor',
      onClick: () => setRoute({ page: 'profesor' }),
    });
  }

  if (user.nombre_rol === 'Administrador') {
    navItems.push({
      label: 'Admin',
      active: route.page === 'admin',
      onClick: () => setRoute({ page: 'admin' }),
    });
  }

  navItems.push({
    label: 'Laravel',
    active: route.page === 'laravel',
    onClick: () => setRoute({ page: 'laravel' }),
  });

  function updatePointsBalance(newBalance: number) {
    setUser((prev) => (prev ? { ...prev, puntos_saldo: newBalance } : prev));
  }

  function updateCustomization(patch: {
    puntos_saldo?: number;
    fondo_activo?: string | null;
    estilo_activo?: string | null;
  }) {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  return (
    <SessionLimitProvider
      userId={user.id_usuario}
      autoOpenSetup={justLoggedIn}
      onAutoOpenHandled={handleAutoOpenHandled}
      onExpire={handleSessionLimitExpired}
    >
      <TimeActivitySync userId={user.id_usuario} />
      <div
        className="aba-shell min-h-screen bg-[#f7f9fb] flex flex-col transition-colors"
        data-aba-bg={user.fondo_activo ?? ''}
        data-aba-style={user.estilo_activo ?? ''}
      >
      {/* Top Bar Contract: 3 zonas exactas */}
      <header className="aba-header bg-white border-b border-slate-200 sticky top-0 z-30 print:hidden">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Zona 1: Wordmark de una sola línea */}
          <button
            type="button"
            onClick={() => setRoute({ page: 'saberes', saberId: null })}
            className="aba-brand font-display text-xl font-bold tracking-tight text-[#1e40af] whitespace-nowrap shrink-0"
          >
            A.B.A.
          </button>

          {/* Zona 2: Enlaces de navegación de una sola línea */}
          <nav className="hidden md:flex items-center gap-4 xl:gap-5 text-sm font-medium text-[#444653]">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition ${
                  item.active
                    ? 'aba-nav-active text-[#1e40af] border-[#4f46e5] font-semibold'
                    : 'border-transparent hover:text-[#191c1e] hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zona 3: Acción primaria */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setRoute({ page: 'cuenta' })}
              title="Ver y editar mi cuenta"
              className="hidden lg:inline text-xs text-[#444653] hover:text-[#1e40af] whitespace-nowrap tabular-nums transition"
            >
              {user.nombre} {user.apellido} · {user.puntos_saldo} pts
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="aba-primary-btn hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold whitespace-nowrap shrink-0 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Abrir menú"
              className="md:hidden p-2 rounded-lg border border-slate-200 text-[#191c1e]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-6 py-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.onClick();
                  setMobileMenuOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-semibold ${
                  item.active ? 'bg-[#eef2ff] text-[#1e40af]' : 'text-[#444653]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-[#ba1a1a]"
            >
              Cerrar sesión ({user.nombre} · {user.nombre_rol})
            </button>
          </div>
        )}
      </header>

      <SessionLimitWarningBanner />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {route.page === 'saberes' && (
          <SaberesView
            user={user}
            selectedSaberId={route.saberId}
            onSelectSaber={(saberId) => setRoute({ page: 'saberes', saberId })}
            onOpenVideo={(videoId) => setRoute({ page: 'videos', videoId })}
            onOpenEvaluacion={(evaluacionId) => setRoute({ page: 'evaluacion', evaluacionId })}
          />
        )}

        {route.page === 'videos' && (
          <VideoPlayerView
            videoId={route.videoId}
            onSelectVideo={(videoId) => setRoute({ page: 'videos', videoId })}
            onOpenSaber={(saberId) => setRoute({ page: 'saberes', saberId })}
            onOpenEvaluacion={(evaluacionId) => setRoute({ page: 'evaluacion', evaluacionId })}
            onPointsUpdated={updatePointsBalance}
          />
        )}

        {route.page === 'evaluacion' && (
          <EvaluacionView
            evaluacionId={route.evaluacionId}
            user={user}
            onBackToSaber={(saberId) => setRoute({ page: 'saberes', saberId })}
            onGoToProgress={() => setRoute({ page: 'progreso' })}
            onPointsUpdated={updatePointsBalance}
          />
        )}

        {route.page === 'progreso' && (
          <DashboardView
            user={user}
            onOpenEvaluacion={(evaluacionId) => setRoute({ page: 'evaluacion', evaluacionId })}
            onSessionExpired={handleSessionExpired}
          />
        )}

        {route.page === 'tiempo' && <TimeHistoryView user={user} />}

        {route.page === 'salas' && (
          <SalasView
            user={user}
            initialRoomCode={inviteRoomCode}
            onClearInitialRoomCode={() => {
              setInviteRoomCode(null);
              const url = new URL(window.location.href);
              url.searchParams.delete('sala');
              window.history.replaceState({}, '', url.pathname + url.search);
            }}
          />
        )}

        {route.page === 'duelos' && <DuelosView user={user} />}

        {route.page === 'tienda' && (
          <TiendaView user={user} onUserCustomizationUpdate={updateCustomization} />
        )}

        {route.page === 'cuenta' && (
          <AccountView
            user={user}
            onUserUpdated={(updatedUser) => setUser(updatedUser)}
            onSessionExpired={handleSessionExpired}
          />
        )}

        {route.page === 'profesor' &&
          (user.nombre_rol === 'Profesor' || user.nombre_rol === 'Administrador' ? (
            <ProfesorView user={user} />
          ) : (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <p className="font-display text-3xl font-bold text-[#ba1a1a]">403</p>
              <h2 className="font-display text-xl font-semibold text-[#191c1e]">Acceso denegado</h2>
              <p className="text-sm text-[#444653]">Esta sección es exclusiva para docentes y administradores.</p>
            </div>
          ))}

        {route.page === 'admin' &&
          (user.nombre_rol === 'Administrador' ? (
            <AdminView />
          ) : (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <p className="font-display text-3xl font-bold text-[#ba1a1a]">403</p>
              <h2 className="font-display text-xl font-semibold text-[#191c1e]">Acceso denegado</h2>
              <p className="text-sm text-[#444653]">Esta sección es exclusiva para administradores.</p>
            </div>
          ))}

        {route.page === 'laravel' && <LaravelDeliverableView />}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12 print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#444653]">
          <span>A.B.A. — Plataforma Educativa de Pedagogía Activa</span>
          <div className="flex flex-wrap items-center gap-4">
            <GlobalSessionTimer />
            <SessionLimitFooterControl />
            <SessionPreferenceFooterControl onLogoutAllDevices={handleLogoutAllDevices} />
            <span>Base de datos relacional de 13 tablas · Español</span>
          </div>
        </div>
      </footer>
      </div>
      <SessionLimitSetupModal />
    </SessionLimitProvider>
  );
}
