"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import k from "./kit.module.css";

/**
 * Barra de abas dos assuntos que deixaram de ter linha própria no menu.
 *
 * As páginas continuam nas MESMAS rotas — só saíram da barra lateral. Isso é
 * de propósito: 22 avisos do sistema (venda fora do webhook, saque pendente,
 * token da Lojou expirado…) apontam directamente para `/admin/finance`,
 * `/admin/saques`, `/admin/status` e companhia. Mover as rotas obrigaria a
 * redirects e partiria justamente os avisos que pedem acção.
 *
 * O `AdminPage` desenha isto sozinho a partir do caminho actual, por isso
 * nenhuma das nove páginas precisou de ser tocada.
 */

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Aba = { href: string; label: string; badge?: "saques" };

const GRUPOS: Aba[][] = [
  [
    { href: "/admin/finance", label: "Visão geral" },
    { href: "/admin/custos", label: "Custos" },
  ],
  [
    { href: "/admin/config", label: "Configurações" },
    { href: "/admin/emails", label: "E-mails" },
    { href: "/admin/status", label: "Status" },
  ],
  [
    { href: "/admin/afiliados", label: "Afiliados" },
    { href: "/admin/coproducers", label: "Coprodutores" },
    { href: "/admin/socios", label: "Sócios" },
    { href: "/admin/saques", label: "Saques", badge: "saques" },
  ],
];

export function AdminTabs() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [pendentes, setPendentes] = useState<number | null>(null);

  const grupo = GRUPOS.find((g) => g.some((a) => a.href === pathname));

  // Só busca o contador quando o grupo mostra o badge — o saque sai do menu,
  // mas não pode sair do radar: alguém está à espera do dinheiro.
  const precisaBadge = !!grupo?.some((a) => a.badge === "saques");
  useEffect(() => {
    if (!precisaBadge) return;
    fetch(`${API}/api/admin/affiliate-withdrawals?status=pending&pageSize=1`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("cz_token")}` },
    })
      .then((r) => r.json())
      .then((d) => setPendentes(d?.metrics?.pendingCount ?? null))
      .catch(() => {});
  }, [precisaBadge]);

  if (!grupo) return null;

  return (
    <nav className={k.subTabs} aria-label="Seções">
      {grupo.map((aba) => {
        const ativa = aba.href === pathname;
        return (
          <button
            key={aba.href}
            type="button"
            className={`${k.subTab} ${ativa ? k.subTabActive : ""}`}
            aria-current={ativa ? "page" : undefined}
            onClick={() => !ativa && router.push(aba.href)}
          >
            {aba.label}
            {aba.badge === "saques" && !!pendentes && (
              <span className={k.subTabBadge}>{pendentes}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
