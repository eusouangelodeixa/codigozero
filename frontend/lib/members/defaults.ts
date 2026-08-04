// Fonte única do shape de personalização de um curso (Course.config no
// banco). Mesclado em runtime com o que o admin salvou — mesmo padrão do
// landingDefaults.ts. Importado pelas páginas do aluno, pelo MembersShell e
// pelo editor WYSIWYG do admin: os três nunca divergem.

export type MemberMenuItem = {
  id: string;
  type: "home" | "continue" | "link";
  icon: string; // chave do registry em lib/members/icons.ts
  label: string;
  url?: string; // apenas type 'link'
};

export type MemberBannerSlide = { id: string; imageUrl: string; linkUrl?: string };

export type MemberHomeSection = { id: string; type: "modules" | "continue"; title?: string };

export type MemberConfig = {
  theme: {
    mode: "dark" | "light";
    primaryColor: string; // ex.: #2DD4BF — vira --accent via ThemeVars
  };
  branding: {
    logoUrl?: string; // 720x128 (sidebar/login)
    faviconUrl?: string; // 64x64
    ogImageUrl?: string; // 1200x630
    coverUrl?: string; // 640x360 (card na grade "Meus Cursos")
    loginBgUrl?: string; // 1920x1080
    loginLayout: "sidebar" | "fullscreen";
  };
  menu: MemberMenuItem[];
  home: {
    banner: { slides: MemberBannerSlide[] }; // 0–3 slides
    sections: MemberHomeSection[]; // ordem das seções da home
  };
};

export const MEMBER_DEFAULTS: MemberConfig = {
  theme: { mode: "dark", primaryColor: "#2DD4BF" },
  branding: { loginLayout: "fullscreen" },
  menu: [
    { id: "home", type: "home", icon: "house", label: "Home" },
    { id: "continue", type: "continue", icon: "play", label: "Continuar assistindo" },
  ],
  home: {
    banner: { slides: [] },
    sections: [
      { id: "sec-continue", type: "continue", title: "Continuar assistindo" },
      { id: "sec-modules", type: "modules" },
    ],
  },
};

/** Merge raso por chave de topo; arrays SUBSTITUEM quando presentes. */
export function mergeMemberConfig(raw: unknown): MemberConfig {
  const r = (raw || {}) as Partial<MemberConfig> & Record<string, any>;
  return {
    theme: { ...MEMBER_DEFAULTS.theme, ...(r.theme || {}) },
    branding: { ...MEMBER_DEFAULTS.branding, ...(r.branding || {}) },
    menu: Array.isArray(r.menu) && r.menu.length ? r.menu : MEMBER_DEFAULTS.menu,
    home: {
      banner: {
        slides: Array.isArray(r.home?.banner?.slides) ? r.home.banner.slides : MEMBER_DEFAULTS.home.banner.slides,
      },
      sections:
        Array.isArray(r.home?.sections) && r.home.sections.length
          ? r.home.sections
          : MEMBER_DEFAULTS.home.sections,
    },
  };
}

/** Derivações da cor primária consumidas pelo ThemeVars (mesma família do --accent global). */
export function accentDerivatives(hex: string) {
  const h = /^#?[0-9a-fA-F]{6}$/.test(hex.replace("#", "")) ? hex.replace("#", "") : "2DD4BF";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Texto sobre a cor: preto-esverdeado da marca em cores claras, branco em escuras.
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return {
    accent: `#${h}`,
    accentFg: luma > 140 ? "#001412" : "#ffffff",
    accentDim: `rgba(${r}, ${g}, ${b}, 0.15)`,
    accentBorder: `rgba(${r}, ${g}, ${b}, 0.35)`,
    accentGlow: `rgba(${r}, ${g}, ${b}, 0.4)`,
  };
}
