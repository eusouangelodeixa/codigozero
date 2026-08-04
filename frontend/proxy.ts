// Roteamento por host da área de membros: members.czero.sbs serve as rotas
// de app/members/* com a URL limpa (members.czero.sbs/codigo-zero), inclusive
// na navegação client-side — o rewrite acontece aqui, por Host, e o nginx do
// subdomínio fica um proxy burro (sem rewrite de path).
//
// Next 16: a convenção middleware.ts foi renomeada para proxy.ts (ver
// node_modules/next/dist/docs/.../file-conventions/proxy.md).
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const { pathname } = req.nextUrl;
  // members.czero.sbs em prod; members.localhost em dev (/etc/hosts).
  if (host.startsWith("members.") && !pathname.startsWith("/members")) {
    const url = req.nextUrl.clone();
    url.pathname = `/members${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // Ignora assets/estáticos e a API — só páginas navegáveis passam pelo rewrite.
  matcher: ["/((?!_next/|api/|uploads/|icons/|sw\\.js|manifest\\.json|.*\\..*).*)"],
};
