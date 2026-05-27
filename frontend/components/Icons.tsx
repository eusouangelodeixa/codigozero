/**
 * Código Zero — Icon Set
 * Thin wrappers around lucide-react so the rest of the codebase keeps the
 * same imports (DashboardIcon, RadarIcon, ...) while the underlying glyphs
 * come from a consistent shadcn-grade set.
 *
 * If a wrapper is ever removed, the inline-SVG fallback in git history is the
 * last good version.
 */

import {
  LayoutGrid,
  Radar,
  Library,
  Hammer,
  Compass,
  MessagesSquare,
  CreditCard,
  Link2,
  Send,
} from "lucide-react";

interface IconProps {
  size?: number;
  className?: string;
}

const STROKE = 1.6;

export function DashboardIcon({ size = 18, className }: IconProps) {
  return <LayoutGrid size={size} strokeWidth={STROKE} className={className} />;
}

export function RadarIcon({ size = 18, className }: IconProps) {
  return <Radar size={size} strokeWidth={STROKE} className={className} />;
}

export function CofreIcon({ size = 18, className }: IconProps) {
  return <Library size={size} strokeWidth={STROKE} className={className} />;
}

export function ForjaIcon({ size = 18, className }: IconProps) {
  return <Hammer size={size} strokeWidth={STROKE} className={className} />;
}

export function QGIcon({ size = 18, className }: IconProps) {
  return <Compass size={size} strokeWidth={STROKE} className={className} />;
}

export function ChatIcon({ size = 18, className }: IconProps) {
  return <MessagesSquare size={size} strokeWidth={STROKE} className={className} />;
}

export function SubscriptionIcon({ size = 18, className }: IconProps) {
  return <CreditCard size={size} strokeWidth={STROKE} className={className} />;
}

export function IntegrationIcon({ size = 18, className }: IconProps) {
  return <Link2 size={size} strokeWidth={STROKE} className={className} />;
}

export function DisparadorIcon({ size = 18, className }: IconProps) {
  return <Send size={size} strokeWidth={STROKE} className={className} />;
}
