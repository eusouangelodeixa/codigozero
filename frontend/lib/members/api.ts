"use client";
// Cliente HTTP da área de membros. Mesma auth do app (Bearer cz_token no
// localStorage — origem members.czero.sbs tem o PRÓPRIO storage, preenchido
// pelo login local ou pelo hop SSO vindo do app).
export const MEMBERS_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function membersToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cz_token");
}

export async function membersFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = membersToken();
  const res = await fetch(`${MEMBERS_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("cz_token");
    localStorage.removeItem("cz_user");
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

/** Guarda simples das páginas members: sem token → /login (da própria origem). */
export function requireMembersAuth(): boolean {
  if (typeof window === "undefined") return false;
  if (!membersToken()) {
    window.location.href = "/login";
    return false;
  }
  return true;
}

export function membersUser(): { id: string; name: string; email: string; avatarUrl?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("cz_user") || "null");
  } catch {
    return null;
  }
}
