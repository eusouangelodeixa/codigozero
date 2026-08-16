"use client";
// Casca da área do curso: sidebar pintada na cor primária (logo, menu
// configurável, colapso, rodapé do usuário) no desktop; barra inferior +
// drawer no mobile — fiel aos prints da Kiwify. Puro/props-driven: também é
// o preview do editor (previewMode desativa navegação real).
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, Menu as MenuIcon, X } from "lucide-react";
import k from "./kit.module.css";
import { memberIcon } from "@/lib/members/icons";
import { absMediaUrl, openAppInNewTab } from "@/lib/members/api";
import type { MemberConfig, MemberMenuItem } from "@/lib/members/defaults";

export type ShellUser = { name?: string; avatarUrl?: string } | null;

function initials(name?: string) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "A";
}

export function MembersShell({
  config,
  courseName,
  user,
  activeItemId = "home",
  onItemClick,
  previewMode = false,
  mobilePreview = false,
  children,
}: {
  config: MemberConfig;
  courseName: string;
  user: ShellUser;
  activeItemId?: string;
  /** home/continue navegam dentro do curso; link abre URL externa. */
  onItemClick?: (item: MemberMenuItem) => void;
  previewMode?: boolean;
  /** Editor: força o layout mobile por classe (media queries não veem o container). */
  mobilePreview?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const click = (item: MemberMenuItem) => {
    setDrawer(false);
    if (previewMode) return;
    if (item.type === "link" && item.url) {
      window.open(item.url, "_blank", "noopener");
      return;
    }
    onItemClick?.(item);
  };

  const logo = config.branding.logoUrl ? (
    <img src={config.branding.logoUrl} alt={courseName} />
  ) : (
    <div className={k.sidebarLogoText}>{courseName}</div>
  );

  const items = config.menu.map((item) => {
    const Icon = memberIcon(item.icon);
    return (
      <button
        key={item.id}
        type="button"
        className={`${k.navItem} ${item.id === activeItemId ? k.navItemActive : ""}`}
        onClick={() => click(item)}
        title={item.label}
      >
        <span className={k.navIcon}>
          <Icon size={collapsed ? 22 : 19} />
        </span>
        <span className={k.navLabel}>{item.label}</span>
      </button>
    );
  });

  return (
    <div className={`${k.shell} ${mobilePreview ? k.forceMobile : ""}`}>
      <aside className={`${k.sidebar} ${collapsed ? k.sidebarCollapsed : ""}`}>
        <div className={k.sidebarTop}>
          <button type="button" className={k.collapseBtn} onClick={() => setCollapsed((c) => !c)} aria-label="Recolher menu">
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
        </div>
        <div className={k.sidebarLogo}>{logo}</div>
        <nav className={k.nav}>{items}</nav>
        {/* Perfil: abre /perfil do app numa nova aba, já logado. */}
        <button type="button" className={k.userFoot} onClick={() => openAppInNewTab("/perfil")} title="Meu perfil" style={{ cursor: "pointer", border: "none", width: "100%", textAlign: "left" }}>
          <span className={k.avatar}>
            {user?.avatarUrl ? <img src={absMediaUrl(user.avatarUrl)} alt="" /> : initials(user?.name)}
          </span>
          <span className={k.userName}>{user?.name || "Aluno"}</span>
          <ChevronUp size={15} className={k.footChevron} style={{ marginLeft: "auto", opacity: 0.7 }} />
        </button>
      </aside>

      <main className={k.main}>{children}</main>

      {/* Mobile: barra inferior com os 3 primeiros itens + menu */}
      <div className={k.bottomBar}>
        {config.menu.slice(0, 3).map((item) => {
          const Icon = memberIcon(item.icon);
          return (
            <button
              key={item.id}
              type="button"
              className={`${k.bottomBtn} ${item.id === activeItemId ? k.bottomBtnActive : ""}`}
              onClick={() => click(item)}
              aria-label={item.label}
            >
              <Icon size={22} />
            </button>
          );
        })}
        <button type="button" className={k.bottomBtn} onClick={() => setDrawer(true)} aria-label="Menu">
          <MenuIcon size={22} strokeWidth={2} />
        </button>
      </div>

      {drawer && (
        <div className={k.drawer}>
          <button type="button" className={k.drawerClose} onClick={() => setDrawer(false)} aria-label="Fechar">
            <X size={22} />
          </button>
          <div className={k.sidebarLogo}>{logo}</div>
          <nav className={k.nav}>{items}</nav>
          <button type="button" className={k.userFoot} onClick={() => openAppInNewTab("/perfil")} title="Meu perfil" style={{ cursor: "pointer", border: "none", width: "100%", textAlign: "left" }}>
            <span className={k.avatar}>
              {user?.avatarUrl ? <img src={absMediaUrl(user.avatarUrl)} alt="" /> : initials(user?.name)}
            </span>
            <span>{user?.name || "Aluno"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
