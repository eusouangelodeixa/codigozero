"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import styles from "./admin.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  superadmin?: boolean; // only shown to superadmin
}

const I = {
  Dashboard: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="4" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="11" width="7" height="10" rx="1" />
    </svg>
  ),
  Finance: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  Leads: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
    </svg>
  ),
  Users: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 11v6M19 14h6" />
    </svg>
  ),
  Lessons: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  ),
  Scripts: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  ),
  Landing: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="11" height="11" rx="1" />
      <rect x="17" y="10" width="4" height="11" rx="1" />
    </svg>
  ),
  Broadcast: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11h2l2-7h2l-3 9-1 4z" />
      <path d="M14 4l7 8-7 8" />
      <path d="M12 12h9" />
    </svg>
  ),
  Coupons: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V7a2 2 0 00-2-2H4a2 2 0 00-2 2v5a2 2 0 002 2v2a2 2 0 00-2 2v0a2 2 0 002 2h14a2 2 0 002-2v0a2 2 0 00-2-2v-2a2 2 0 002-2z" />
      <line x1="14" y1="7" x2="14" y2="9" />
      <line x1="14" y1="12" x2="14" y2="14" />
      <line x1="14" y1="17" x2="14" y2="19" />
    </svg>
  ),
  Status: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Chat: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  Config: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  Affiliates: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ),
  Withdrawals: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  ),
  Coproducers: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 17a4 4 0 11-4 4 4 4 0 014-4z" />
      <path d="M21 8.94l-2-.39a7.71 7.71 0 00-.46-1.11l1.14-1.68a.5.5 0 00-.06-.63L18.43 4.5a.5.5 0 00-.63-.06L16.12 5.58a7.71 7.71 0 00-1.11-.46L14.62 3a.5.5 0 00-.49-.41h-2.26a.5.5 0 00-.49.41l-.39 1.94" />
    </svg>
  ),
};

const NAV: NavGroup[] = [
  {
    label: "Visão Geral",
    items: [
      { href: "/admin",         label: "Dashboard",   icon: I.Dashboard },
      { href: "/admin/finance", label: "Financeiro",  icon: I.Finance },
      { href: "/admin/custos",  label: "Custos",      icon: I.Finance, superadmin: true },
      { href: "/admin/status",  label: "Status",      icon: I.Status },
    ],
  },
  {
    label: "Pessoas",
    items: [
      { href: "/admin/users",   label: "Usuários",    icon: I.Users },
      { href: "/admin/leads",   label: "Leads",       icon: I.Leads },
      { href: "/admin/chat",    label: "Chat Suporte", icon: I.Chat },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { href: "/admin/aulas",   label: "Aulas",       icon: I.Lessons },
      { href: "/admin/scripts", label: "Scripts",     icon: I.Scripts },
      { href: "/admin/landing", label: "Landing page", icon: I.Landing },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/admin/broadcast", label: "Broadcast", icon: I.Broadcast },
      { href: "/admin/emails",    label: "E-mails",   icon: I.Broadcast },
      { href: "/admin/cupons",    label: "Cupons",    icon: I.Coupons },
      { href: "/admin/config",    label: "Configurações", icon: I.Config },
    ],
  },
  {
    label: "Afiliados",
    items: [
      { href: "/admin/afiliados", label: "Afiliados",  icon: I.Affiliates },
      { href: "/admin/saques",    label: "Saques",     icon: I.Withdrawals },
    ],
  },
  {
    label: "Parceiros",
    items: [
      { href: "/admin/coproducers", label: "Coprodutores", icon: I.Coproducers },
      { href: "/admin/socios", label: "Sócios", icon: I.Finance },
    ],
  },
];

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface User {
  name?: string;
  email?: string;
  role?: string;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("cz_token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.user || (data.user.role !== "admin" && data.user.role !== "superadmin")) {
          router.push("/dashboard");
          return;
        }
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <Logo size={36} />
        <p>verificando permissões…</p>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <aside className={cx(styles.sidebar, mobileMenuOpen && styles.sidebarOpen)}>
        <div className={styles.sidebarHead}>
          <Logo size={22} />
          <div className={styles.sidebarHeadText}>
            <span className={styles.sidebarRole}>Admin</span>
          </div>
        </div>

        <nav className={styles.sidebarNav}>
          {NAV.map((group) => (
            <div key={group.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  padding: "12px 12px 6px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--text-tertiary)",
                }}
              >
                {group.label}
              </span>
              {group.items.filter((item) => !item.superadmin || user?.role === "superadmin").map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className={cx(styles.navItem, pathname === item.href && styles.navItemActive)}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarUser}>
            <div className={styles.sidebarAvatar}>{user?.name?.[0]?.toUpperCase() || "A"}</div>
            <div className={styles.sidebarUserMeta}>
              <p className={styles.sidebarUserName}>{user?.name}</p>
              <p className={styles.sidebarUserEmail}>{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.sidebarLogout}
            onClick={() => router.push("/dashboard")}
          >
            ← Voltar ao app
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileMenuOpen(false)} />
      )}

      <main className={styles.main}>
        <header className={styles.mobileHeader}>
          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
          <span className={styles.mobileTitle}>Admin</span>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => router.push("/dashboard")}
            aria-label="Voltar ao app"
            title="Voltar ao app"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}
