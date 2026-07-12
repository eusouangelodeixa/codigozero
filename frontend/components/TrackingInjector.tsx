"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Rotas de marketing onde os pixels/scripts de conversão devem rodar. NUNCA no
// app autenticado: o JWT de sessão vive em localStorage, então um script de
// terceiro (GTM/Pixel) — ou um fornecedor comprometido — executando na origem
// logada poderia ler e exfiltrar o token. Allowlist: o padrão é NÃO injetar.
function isMarketingRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return ["/lp", "/central", "/conteudo"].some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// Injeta uma única vez por sessão (evita duplicar GTM/Pixel ao navegar entre
// páginas de marketing e recontar conversões).
let injected = false;

export function TrackingInjector() {
  const pathname = usePathname();

  useEffect(() => {
    if (injected) return;
    if (!pathname || !isMarketingRoute(pathname)) return;
    injected = true;

    fetch(`${API_URL}/api/landing/config`)
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          if (data.config.headScripts) {
            const fragment = document.createRange().createContextualFragment(data.config.headScripts);
            document.head.appendChild(fragment);
          }
          if (data.config.bodyScripts) {
            const fragment = document.createRange().createContextualFragment(data.config.bodyScripts);
            document.body.appendChild(fragment);
          }
        }
      })
      .catch((err) => {
        injected = false; // permite nova tentativa se a config falhar ao carregar
        console.error("Tracking Injector Error:", err);
      });
  }, [pathname]);

  return null;
}
