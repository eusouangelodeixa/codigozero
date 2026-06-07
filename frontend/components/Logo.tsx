type LogoVariant = "wordmark" | "mark";

/**
 * Brand logo.
 *
 * - "wordmark" (default): the horizontal "Código Zero" lockup. `size` is the
 *   HEIGHT in px; width scales with the ~5.4:1 aspect ratio. Use this as the
 *   standalone brand — do NOT place a "Código Zero" text label next to it.
 * - "mark": the square symbol only (`size` × `size`). Use where the logo sits
 *   beside non-brand text (e.g. a page title) or in tight square slots.
 */
export function Logo({
  size = 28,
  variant = "wordmark",
}: {
  size?: number;
  variant?: LogoVariant;
}) {
  if (variant === "mark") {
    return (
      <img
        src="/logo-mark.png?v=5"
        alt="Código Zero"
        width={size}
        height={size}
        style={{ display: "block", objectFit: "contain", borderRadius: size * 0.22 }}
        draggable={false}
      />
    );
  }
  return (
    <img
      src="/logo-horizontal.png?v=4"
      alt="Código Zero"
      height={size}
      style={{ display: "block", height: size, width: "auto", objectFit: "contain" }}
      draggable={false}
    />
  );
}
