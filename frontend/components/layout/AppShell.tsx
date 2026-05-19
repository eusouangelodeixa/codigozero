"use client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import {
  DashboardIcon,
  RadarIcon,
  CofreIcon,
  ForjaIcon,
  QGIcon,
  ChatIcon,
  DisparadorIcon,
  SubscriptionIcon,
  IntegrationIcon,
} from "@/components/Icons";
import styles from "./AppShell.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type IconCmp = (props: { size?: number; className?: string }) => ReactNode;

interface NavItem {
  href: string;
  label: string;
  icon: IconCmp;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/dashboard", label: "Início", icon: DashboardIcon },
      { href: "/radar", label: "Radar", icon: RadarIcon },
      { href: "/disparador", label: "Disparador", icon: DisparadorIcon },
    ],
  },
  {
    label: "Arsenal",
    items: [
      { href: "/cofre", label: "Cofre", icon: CofreIcon },
      { href: "/forja", label: "Forja", icon: ForjaIcon },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { href: "/qg", label: "QG", icon: QGIcon },
      { href: "/chat", label: "Chat", icon: ChatIcon },
    ],
  },
  {
    label: "Negócio",
    items: [
      {
        href: "/afiliacao",
        label: "Afiliação",
        icon: ({ size = 18 }: { size?: number; className?: string }) => (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/assinatura", label: "Assinatura", icon: SubscriptionIcon },
      { href: "/integracoes", label: "Integrações", icon: IntegrationIcon },
      {
        href: "/instalar",
        label: "Instalar app",
        icon: ({ size = 18 }: { size?: number; className?: string }) => (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2.5" />
            <line x1="12" y1="18" x2="12" y2="18.01" />
          </svg>
        ),
      },
    ],
  },
];

const MenuIcon = ({ size = 20 }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);

const CloseIcon = ({ size = 18 }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

const BOTTOM_NAV: NavItem[] = [
  { href: "/dashboard", label: "Início", icon: DashboardIcon },
  { href: "/radar", label: "Radar", icon: RadarIcon },
  { href: "/forja", label: "Forja", icon: ForjaIcon },
  { href: "/cofre", label: "Cofre", icon: CofreIcon },
];

// Fallback mapping for the mobile topbar title.
const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Início",
  "/radar": "Radar",
  "/disparador": "Disparador",
  "/cofre": "Cofre",
  "/forja": "Forja",
  "/qg": "QG",
  "/chat": "Chat",
  "/afiliacao": "Afiliação",
  "/assinatura": "Assinatura",
  "/integracoes": "Integrações",
  "/instalar": "Instalar app",
  "/perfil": "Perfil",
  "/onboarding": "Onboarding",
};

export interface AppShellUser {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
}

export function AppShell({
  user,
  onLogout,
  children,
}: {
  user: AppShellUser | null;
  onLogout: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);

  const pageTitle = useMemo(() => {
    if (!pathname) return "Código Zero";
    if (pathname.startsWith("/admin")) return "Admin";
    return PAGE_TITLES[pathname] || "Código Zero";
  }, [pathname]);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const firstName = user?.name?.split(" ")[0] || "Membro";
  const initial = (user?.name?.charAt(0) || "?").toUpperCase();
  const avatarSrc = user?.avatarUrl
    ? user.avatarUrl.startsWith("/")
      ? `${apiUrl}${user.avatarUrl}`
      : user.avatarUrl
    : null;

  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <div className={styles.shell}>
      {/* ───────── Desktop sidebar ───────── */}
      <aside className={styles.sidebar} aria-label="Navegação principal">
        <a href="/dashboard" onClick={go("/dashboard")} className={styles.brand}>
          <Logo size={26} />
          <span className={styles.brandName}>Código Zero</span>
          <span className={styles.brandDot} aria-hidden />
        </a>

        <nav className={styles.navList}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className={styles.group}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={go(item.href)}
                    className={cx(styles.navItem, active && styles.navItemActive)}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={styles.navIcon}><Icon size={17} /></span>
                    <span className={styles.navLabel}>{item.label}</span>
                    {item.badge && <span className={styles.navBadge}>{item.badge}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={styles.userFooter}>
          <a
            href="/perfil"
            onClick={go("/perfil")}
            className={styles.userCard}
            aria-label="Abrir perfil"
          >
            <div className={styles.avatar}>
              {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
            </div>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{firstName}</span>
              <span className={cx(styles.userRole, isAdmin && styles.userRoleAdmin)}>
                {user?.role === "superadmin" ? "Super Admin" : isAdmin ? "Admin" : "Membro"}
              </span>
            </div>
          </a>

          {isAdmin && (
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className={cx(styles.iconButton, styles.adminButton)}
              aria-label="Painel admin"
              title="Painel admin"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className={cx(styles.iconButton, styles.logoutButton)}
            aria-label="Sair"
            title="Sair"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ───────── Main column ───────── */}
      <div className={styles.main}>
        {/* Mobile topbar */}
        <header className={styles.mobileTopbar}>
          <div className={styles.topbarBrand}>
            <Logo size={22} />
            <span className={styles.topbarTitle}>{pageTitle}</span>
          </div>
          <a
            href="/perfil"
            onClick={go("/perfil")}
            className={styles.topbarAvatar}
            aria-label="Perfil"
          >
            {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
          </a>
        </header>

        <main className={styles.content}>{children}</main>
      </div>

      {/* ───────── Mobile bottom-nav ───────── */}
      <nav className={styles.bottomNav} aria-label="Navegação rápida">
        <div className={styles.bottomNavInner}>
          {BOTTOM_NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={go(item.href)}
                className={cx(styles.bottomItem, active && styles.bottomItemActive)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </a>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cx(styles.bottomItem, menuOpen && styles.bottomItemActive)}
            aria-label="Abrir menu completo"
            aria-expanded={menuOpen}
          >
            <MenuIcon size={20} />
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {/* ───────── Mobile drawer (full nav) ───────── */}
      {menuOpen && (
        <div
          className={styles.drawerBackdrop}
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cx(styles.drawer, menuOpen && styles.drawerOpen)}
        aria-hidden={!menuOpen}
        aria-label="Menu completo"
      >
        <header className={styles.drawerHeader}>
          <a
            href="/perfil"
            onClick={go("/perfil")}
            className={styles.drawerUser}
            aria-label="Abrir perfil"
          >
            <div className={styles.avatar}>
              {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
            </div>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{firstName}</span>
              <span className={cx(styles.userRole, isAdmin && styles.userRoleAdmin)}>
                {user?.role === "superadmin" ? "Super Admin" : isAdmin ? "Admin" : "Membro"}
              </span>
            </div>
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className={styles.drawerClose}
            aria-label="Fechar menu"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <nav className={styles.drawerNav}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className={styles.group}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={go(item.href)}
                    className={cx(styles.navItem, active && styles.navItemActive)}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className={styles.navIcon}><Icon size={17} /></span>
                    <span className={styles.navLabel}>{item.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <footer className={styles.drawerFooter}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setMenuOpen(false); router.push("/admin"); }}
              className={cx(styles.iconButton, styles.adminButton)}
              aria-label="Painel admin"
              title="Painel admin"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <span>Admin</span>
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className={cx(styles.iconButton, styles.logoutButton)}
            aria-label="Sair"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sair</span>
          </button>
        </footer>
      </aside>
    </div>
  );
}

export function AppShellLoading() {
  return (
    <div className={styles.loadingScreen}>
      <span className={styles.loadingDot} />
      <span className={styles.loadingLabel}>carregando</span>
    </div>
  );
}
