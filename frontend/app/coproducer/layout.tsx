"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { LayoutGrid, BarChart3, Users as UsersIcon, Send, LogOut, ExternalLink, Copy, Settings } from "lucide-react";
import styles from "./coproducer.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface MeData {
  id: string;
  code: string;
  productPid: string;
  sharePct: number;
  displayName: string;
  enabled: boolean;
  landingUrl: string;
}

const NAV = [
  { href: "/coproducer",          label: "Visão geral", icon: <LayoutGrid size={17} /> },
  { href: "/coproducer/finance",  label: "Vendas",      icon: <BarChart3 size={17} /> },
  { href: "/coproducer/leads",    label: "Leads",       icon: <Send size={17} /> },
  { href: "/coproducer/users",    label: "Assinantes",  icon: <UsersIcon size={17} /> },
  { href: "/coproducer/config",   label: "Rastreio",    icon: <Settings size={17} /> },
];

export default function CoproducerLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<MeData | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("cz_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    fetch(`${API_URL}/api/coproducer/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) { localStorage.clear(); window.location.href = "/login"; return null; }
        if (r.status === 403) { window.location.href = "/dashboard"; return null; }
        return r.json();
      })
      .then((data) => {
        if (data?.id) setMe(data);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  const logout = () => {
    localStorage.removeItem("cz_token");
    localStorage.removeItem("cz_user");
    window.location.href = "/login";
  };

  const copyLink = async () => {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.landingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (!ready) {
    return (
      <div className={styles.loading}><span>Carregando…</span></div>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Logo size={26} />
          <div>
            <div className={styles.brandName}>Coprodução</div>
            <div className={styles.brandSub}>Código Zero</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV.map((item) => {
            const active = item.href === "/coproducer"
              ? pathname === "/coproducer"
              : pathname?.startsWith(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => { e.preventDefault(); router.push(item.href); }}
                className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        {me && (
          <div className={styles.linkCard}>
            <span className={styles.linkLabel}>Seu link</span>
            <code className={styles.linkValue}>{me.landingUrl.replace(/^https?:\/\//, "")}</code>
            <div className={styles.linkActions}>
              <button onClick={copyLink} className={styles.linkBtn}>
                <Copy size={12} /> {copied ? "Copiado" : "Copiar"}
              </button>
              <a href={me.landingUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                <ExternalLink size={12} /> Abrir
              </a>
            </div>
          </div>
        )}

        <div className={styles.userCard}>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{me?.displayName || "—"}</span>
            <span className={styles.userRole}>Coprodutor · {me?.sharePct ?? "—"}%</span>
          </div>
          <button onClick={logout} className={styles.logoutBtn} aria-label="Sair" title="Sair">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
