export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt="Código Zero"
      width={size}
      height={size}
      style={{ display: "block", objectFit: "contain" }}
      draggable={false}
    />
  );
}
