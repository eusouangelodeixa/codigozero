"use client";
// Injeta o tema do curso como CSS vars num wrapper — todos os componentes do
// kit members (e o kit global, que consome var(--accent*)) re-skinnam por
// herança. Usado pelas páginas do aluno E pelo preview do editor do admin.
import { type CSSProperties, type ReactNode } from "react";
import { accentDerivatives, type MemberConfig } from "@/lib/members/defaults";

export function themeStyle(config: MemberConfig): CSSProperties {
  const a = accentDerivatives(config.theme.primaryColor);
  const light = config.theme.mode === "light";
  return {
    "--accent": a.accent,
    "--accent-fg": a.accentFg,
    "--accent-dim": a.accentDim,
    "--accent-border": a.accentBorder,
    "--accent-glow": a.accentGlow,
    "--m-bg": light ? "#f4f4f5" : "#0a0a0a",
    "--m-surface": light ? "#ffffff" : "#161616",
    "--m-text": light ? "#18181b" : "#f4f4f5",
    "--m-text-dim": light ? "#71717a" : "#9ca3af",
  } as CSSProperties;
}

export function ThemeVars({
  config,
  children,
  className,
}: {
  config: MemberConfig;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} style={{ ...themeStyle(config), background: "var(--m-bg)", color: "var(--m-text)", minHeight: "100%" }}>
      {children}
    </div>
  );
}
