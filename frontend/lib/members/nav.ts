"use client";
// A área de membros é servida de duas formas: members.czero.sbs/<path>
// (proxy.ts reescreve para /members/<path>) e app.czero.sbs/members/<path>
// (acesso direto). Toda navegação client-side passa por aqui para montar o
// href certo conforme a origem atual.
export function memberHref(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined" && window.location.hostname.startsWith("members.")) {
    return clean;
  }
  return `/members${clean === "/" ? "" : clean}`;
}

export function memberGo(path: string): void {
  window.location.href = memberHref(path);
}
