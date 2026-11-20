const TOKEN_STORAGE_KEY = 'aba_session_token';
const REFRESH_STORAGE_KEY = 'aba_refresh_token';
const PERSISTENCE_STORAGE_KEY = 'aba_session_persistence';

export type SessionPersistenceMode = 'persistent' | 'temporary';

function readFromStore(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function clearStore(store: Storage | undefined): void {
  try {
    store?.removeItem(TOKEN_STORAGE_KEY);
    store?.removeItem(REFRESH_STORAGE_KEY);
    store?.removeItem(PERSISTENCE_STORAGE_KEY);
  } catch {
    // Ignorar errores de almacenamiento en entornos restringidos
  }
}

export function getSessionPersistence(): SessionPersistenceMode | null {
  const sessionVal = readFromStore(window.sessionStorage, PERSISTENCE_STORAGE_KEY);
  if (sessionVal === 'temporary' || sessionVal === 'persistent') return sessionVal;
  const localVal = readFromStore(window.localStorage, PERSISTENCE_STORAGE_KEY);
  if (localVal === 'persistent' || localVal === 'temporary') return localVal;
  return null;
}

export function getSessionToken(): string | null {
  return (
    readFromStore(window.sessionStorage, TOKEN_STORAGE_KEY) ??
    readFromStore(window.localStorage, TOKEN_STORAGE_KEY)
  );
}

export function getRefreshToken(): string | null {
  return (
    readFromStore(window.sessionStorage, REFRESH_STORAGE_KEY) ??
    readFromStore(window.localStorage, REFRESH_STORAGE_KEY)
  );
}

export function setSessionTokens(params: {
  token: string | null;
  refreshToken?: string | null;
  persistent?: boolean;
}): void {
  clearStore(window.sessionStorage);
  clearStore(window.localStorage);

  if (!params.token) {
    return;
  }

  const persistent = Boolean(params.persistent);
  try {
    const targetStore = persistent ? window.localStorage : window.sessionStorage;
    targetStore.setItem(TOKEN_STORAGE_KEY, params.token);
    targetStore.setItem(PERSISTENCE_STORAGE_KEY, persistent ? 'persistent' : 'temporary');
    if (params.refreshToken) {
      targetStore.setItem(REFRESH_STORAGE_KEY, params.refreshToken);
    }
  } catch {
    // Ignorar errores de almacenamiento en entornos restringidos
  }
}

export function setSessionToken(token: string | null): void {
  if (!token) {
    setSessionTokens({ token: null });
    return;
  }
  const currentPersistence = getSessionPersistence() === 'persistent';
  const currentRefresh = getRefreshToken();
  setSessionTokens({
    token,
    refreshToken: currentRefresh,
    persistent: currentPersistence,
  });
}

let inFlightRefresh: Promise<boolean> | null = null;

async function refreshSessionOnce(): Promise<boolean> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    const refreshToken = getRefreshToken();
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
      });
      if (!res.ok) {
        setSessionTokens({ token: null });
        return false;
      }
      const data = (await res.json()) as {
        token?: string;
        refreshToken?: string;
        persistent?: boolean;
      };
      if (typeof data.token === 'string') {
        setSessionTokens({
          token: data.token,
          refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
          persistent: Boolean(data.persistent),
        });
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

const NO_REFRESH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout'];

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const buildHeaders = () => {
    const headers = new Headers(init.headers);
    const token = getSessionToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  };

  const response = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(),
  });

  if (response.status === 401 && !NO_REFRESH_PATHS.some((p) => input.startsWith(p))) {
    const refreshed = await refreshSessionOnce();
    if (refreshed) {
      return fetch(input, {
        ...init,
        credentials: 'include',
        headers: buildHeaders(),
      });
    }
  }

  return response;
}
