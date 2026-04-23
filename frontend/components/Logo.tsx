/**
 * Código Zero Logo — Inline SVG
 * Teal circle + diagonal slash + code brackets (// {)
 * Represents "zero code needed"
 */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Circle */}
      <circle cx="60" cy="60" r="50" stroke="#2DD4BF" strokeWidth="5" fill="none" />
      {/* Diagonal slash */}
      <line x1="30" y1="95" x2="90" y2="25" stroke="#2DD4BF" strokeWidth="5" strokeLinecap="round" />
      {/* Code slashes // */}
      <text x="28" y="72" fontFamily="monospace" fontSize="32" fontWeight="700" fill="#2DD4BF">/</text>
      <text x="40" y="72" fontFamily="monospace" fontSize="32" fontWeight="700" fill="#2DD4BF">/</text>
      {/* Curly brace { */}
      <text x="68" y="75" fontFamily="monospace" fontSize="38" fontWeight="700" fill="#2DD4BF">{"{"}</text>
    </svg>
  );
}

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="60" cy="60" r="50" stroke="#2DD4BF" strokeWidth="6" fill="none" />
      <line x1="30" y1="95" x2="90" y2="25" stroke="#2DD4BF" strokeWidth="6" strokeLinecap="round" />
      <text x="28" y="72" fontFamily="monospace" fontSize="32" fontWeight="700" fill="#2DD4BF">/</text>
      <text x="40" y="72" fontFamily="monospace" fontSize="32" fontWeight="700" fill="#2DD4BF">/</text>
      <text x="68" y="75" fontFamily="monospace" fontSize="38" fontWeight="700" fill="#2DD4BF">{"{"}</text>
    </svg>
  );
}
