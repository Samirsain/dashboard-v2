"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, setToken, ApiError } from "./api";
import type { Doer } from "./types";

interface AuthContextValue {
  user: Doer | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The last /auth/me answer, kept so a reload (or opening the installed app)
 * renders straight away instead of blocking every page on a fresh round trip.
 * It only drives what the UI shows — the server still checks the token and
 * the live role on every request.
 */
const USER_STORAGE_KEY = "tm_auth_user";

function readCachedUser(): Doer | null {
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Doer) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: Doer | null): void {
  try {
    if (user) window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): just means no instant start next time.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Doer | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      writeCachedUser(null);
      // Defer to a microtask so this doesn't setState synchronously within the effect.
      queueMicrotask(() => setLoading(false));
      return;
    }

    const cached = readCachedUser();
    if (cached) {
      queueMicrotask(() => {
        setUser(cached);
        setLoading(false);
      });
    }

    // Always re-check in the background: picks up role/permission changes,
    // and signs out a token the server no longer accepts.
    api
      .get<Doer>("/auth/me")
      .then((me) => {
        setUser(me);
        writeCachedUser(me);
      })
      .catch((err) => {
        // A slow or unreachable server is not a reason to sign someone out;
        // only an explicit rejection of the token is.
        const rejected = err instanceof ApiError && (err.status === 401 || err.status === 403);
        if (rejected || !cached) {
          clearToken();
          writeCachedUser(null);
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const result = await api.public.post<{ token: string; user: Doer }>("/auth/login", {
        identifier,
        password,
      });
      setToken(result.token);
      writeCachedUser(result.user);
      setUser(result.user);
      router.push("/");
    },
    [router]
  );

  const logout = useCallback(() => {
    clearToken();
    writeCachedUser(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
