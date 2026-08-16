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
    window.location.href = membersLoginPath();
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `HTTP ${res.status}`);
  return data as T;
}

/**
 * Para onde mandar quem não está logado. Se está DENTRO de um curso
 * (members.czero.sbs/{slug}/…), vai pro login TEMÁTICO do curso (/{slug}/login,
 * com a arte de fundo que o admin subiu) — não pro login genérico. Antes ia
 * sempre pro genérico, então o comprador de um curso nunca via o fundo dele.
 */
function membersLoginPath(): string {
  if (typeof window === "undefined") return "/login";
  const seg = window.location.pathname.split("/").filter(Boolean)[0];
  const reserved = new Set(["login", "sso"]);
  return seg && !reserved.has(seg) ? `/${seg}/login` : "/login";
}

/** Guarda simples das páginas members: sem token → login (temático se num curso). */
export function requireMembersAuth(): boolean {
  if (typeof window === "undefined") return false;
  if (!membersToken()) {
    window.location.href = membersLoginPath();
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

/**
 * Absolutiza URLs relativas de mídia (ex.: /uploads/avatars/… do avatar).
 * No domínio members uma URL relativa apontaria para members.czero.sbs, mas
 * os arquivos são servidos pelo host do backend (app.czero.sbs).
 */
export function absMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${MEMBERS_API}${url.startsWith("/") ? "" : "/"}${url}`;
}
