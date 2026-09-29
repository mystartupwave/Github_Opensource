"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { Me, Meta } from "./types";

type Session = {
  me: Me | null;
  meta: Meta | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  can: (perm: string) => boolean;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMeta = useCallback(async () => {
    setMeta(await api<Meta>("/api/meta"));
  }, []);

  const refreshMe = useCallback(async () => {
    setMe(await api<Me>("/api/auth/me"));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      setMeta(null);
    });
    if (!getToken()) {
      setLoading(false);
      return;
    }
    Promise.all([refreshMe(), refreshMeta()])
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [refreshMe, refreshMeta]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ access_token: string; user: Me }>("/api/auth/login", { method: "POST", json: { email, password } });
      setToken(res.access_token);
      setMe(res.user);
      await refreshMeta();
    },
    [refreshMeta],
  );

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* token may already be invalid */
    }
    setToken(null);
    setMe(null);
    setMeta(null);
  }, []);

  const can = useCallback((perm: string) => !!me && (me.is_admin || me.permissions.includes(perm)), [me]);

  const value = useMemo(
    () => ({ me, meta, loading, login, logout, refreshMe, refreshMeta, can }),
    [me, meta, loading, login, logout, refreshMe, refreshMeta, can],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}

/** Meta is guaranteed inside the authenticated app shell. */
export function useMeta(): Meta {
  const { meta } = useSession();
  if (!meta) throw new Error("meta not loaded");
  return meta;
}
