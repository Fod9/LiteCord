import { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getCurrentUser,
  login as authLogin,
  signup as authSignup,
  logout as authLogout,
} from "../services/auth";
import type { User } from "../services/auth";

function connectWebSocket() {
  invoke("connect_ws").catch((e) => console.error("[ws] connexion échouée:", e));
}

export type WsStatus = "connecting" | "connected" | "reconnecting" | "error";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  wsStatus: WsStatus;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [];

    unsubs.push(listen("ws-connected", () => setWsStatus("connected")));
    unsubs.push(listen("ws-reconnecting", () => setWsStatus("reconnecting")));
    unsubs.push(listen<string>("ws-error", () => setWsStatus("error")));

    return () => { unsubs.forEach((p) => p.then((fn) => fn())); };
  }, []);

  useEffect(() => {
    getCurrentUser()
      .then((u) => {
        setUser(u);
        if (u) connectWebSocket();
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const me = await authLogin(email, password);
    setUser(me);
    setWsStatus("connecting");
    connectWebSocket();
  }

  async function signup(name: string, email: string, password: string) {
    const me = await authSignup(name, email, password);
    setUser(me);
    setWsStatus("connecting");
    connectWebSocket();
  }

  async function logout() {
    await authLogout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, wsStatus, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
