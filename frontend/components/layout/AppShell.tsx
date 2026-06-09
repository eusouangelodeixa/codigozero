"use client";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Handshake,
  Smartphone,
  Menu as LucideMenu,
  X as LucideX,
  ShieldCheck,
  LogOut,
  Star,
  Percent,
  Wrench,
} from "lucide-react";
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
        icon: ({ size = 18, className }: { size?: number; className?: string }) => (
          <Handshake size={size} strokeWidth={1.6} className={className} />
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
        icon: ({ size = 18, className }: { size?: number; className?: string }) => (
          <Smartphone size={size} strokeWidth={1.6} className={className} />
        ),
      },
    ],
  },
];

const MenuIcon = ({ size = 20, className }: { size?: number; className?: string }) => (
  <LucideMenu size={size} strokeWidth={1.6} className={className} />
);

const CloseIcon = ({ size = 18, className }: { size?: number; className?: string }) => (
  <LucideX size={size} strokeWidth={1.6} className={className} />
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
  "/ferramentas": "Ferramentas",
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
  closeFriends?: boolean;
  closeFriendsUntil?: string | null;
  isPartner?: boolean;
  // True when the embedded Komunika tenant is provisioned + active for the user.
  komunikaActive?: boolean;
}

const SociosNavItem: NavItem = {
  href: "/socios",
  label: "Sócios",
  icon: ({ size = 18, className }: { size?: number; className?: string }) => (
    <Percent size={size} strokeWidth={1.6} className={className} />
  ),
};

// "Ferramentas" hub — a catalog page (/ferramentas) holding Komunika and future
// tools, each with a description and its own open/launch action.
const FerramentasNavItem: NavItem = {
  href: "/ferramentas",
  label: "Hub de Ferramentas",
  icon: ({ size = 18, className }: { size?: number; className?: string }) => (
    <Wrench size={size} strokeWidth={1.6} className={className} />
  ),
};

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

  // Inject conditional nav: "Sócios" for revenue-share partners, plus the
  // "Ferramentas" hub (Komunika + future tools), shown to every member.
  const navGroups = useMemo(() => {
    let groups: NavGroup[] = NAV_GROUPS;
    if (user?.isPartner) {
      groups = groups.map((g) =>
        g.label === "Negócio" ? { ...g, items: [...g.items, SociosNavItem] } : g,
      );
    }
    const ferramentas: NavGroup = { label: "Ferramentas", items: [FerramentasNavItem] };
    const contaIdx = groups.findIndex((g) => g.label === "Conta");
    groups =
      contaIdx === -1
        ? [...groups, ferramentas]
        : [...groups.slice(0, contaIdx), ferramentas, ...groups.slice(contaIdx)];
    return groups;
  }, [user?.isPartner]);

  const firstName = user?.name?.split(" ")[0] || "Membro";
  const initial = (user?.name?.charAt(0) || "?").toUpperCase();
  const avatarSrc = user?.avatarUrl
    ? user.avatarUrl.startsWith("/")
      ? `${apiUrl}${user.avatarUrl}`
      : user.avatarUrl
    : null;
  const isCloseFriends = !!user?.closeFriends;
  const cfTitle = user?.closeFriendsUntil
    ? `Membro Close Friends até ${new Date(user.closeFriendsUntil).toLocaleDateString("pt-PT")}`
    : "Membro Close Friends";

  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <div className={styles.shell}>
      {/* ───────── Desktop sidebar ───────── */}
      <aside className={styles.sidebar} aria-label="Navegação principal">
        <a href="/dashboard" onClick={go("/dashboard")} className={styles.brand}>
          <Logo size={24} />
          <span className={styles.brandDot} aria-hidden />
        </a>

        <nav className={styles.navList}>
          {navGroups.map((group) => (
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
            <div className={cx(styles.avatar, isCloseFriends && styles.avatarCF)}>
              {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
            </div>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{firstName}</span>
              <span className={cx(styles.userRole, isAdmin && styles.userRoleAdmin)}>
                {user?.role === "superadmin" ? "Super Admin" : isAdmin ? "Admin" : "Membro"}
              </span>
              {isCloseFriends && (
                <span className={styles.cfBadge} title={cfTitle}>
                  <Star size={10} fill="currentColor" strokeWidth={0} />
                  Close Friends
                </span>
              )}
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
              <ShieldCheck size={15} strokeWidth={1.6} />
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className={cx(styles.iconButton, styles.logoutButton)}
            aria-label="Sair"
            title="Sair"
          >
            <LogOut size={15} strokeWidth={1.6} />
          </button>
        </div>
      </aside>

      {/* ───────── Main column ───────── */}
      <div className={styles.main}>
        {/* Mobile topbar */}
        <header className={styles.mobileTopbar}>
          <div className={styles.topbarBrand}>
            <Logo size={22} />
            <span className={styles.topbarDivider} aria-hidden />
            <span className={styles.topbarTitle}>{pageTitle}</span>
          </div>
          <a
            href="/perfil"
            onClick={go("/perfil")}
            className={cx(styles.topbarAvatar, isCloseFriends && styles.topbarAvatarCF)}
            aria-label={isCloseFriends ? "Perfil — Close Friends" : "Perfil"}
            title={isCloseFriends ? cfTitle : undefined}
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
            <div className={cx(styles.avatar, isCloseFriends && styles.avatarCF)}>
              {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
            </div>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{firstName}</span>
              <span className={cx(styles.userRole, isAdmin && styles.userRoleAdmin)}>
                {user?.role === "superadmin" ? "Super Admin" : isAdmin ? "Admin" : "Membro"}
              </span>
              {isCloseFriends && (
                <span className={styles.cfBadge} title={cfTitle}>
                  <Star size={10} fill="currentColor" strokeWidth={0} />
                  Close Friends
                </span>
              )}
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
          {navGroups.map((group) => (
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
              <ShieldCheck size={15} strokeWidth={1.6} />
              <span>Admin</span>
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className={cx(styles.iconButton, styles.logoutButton)}
            aria-label="Sair"
          >
            <LogOut size={15} strokeWidth={1.6} />
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
