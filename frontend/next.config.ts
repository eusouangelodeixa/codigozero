import type { NextConfig } from "next";

// CSP: diretivas de proteção que NÃO quebram o app. As páginas injetam pixels
// de terceiros (Meta/GA/TikTok) com script inline por design, então travar
// script-src/connect-src exigiria nonce + inventário completo de hosts e teste
// ao vivo — deixado como follow-up. Estas aqui são seguras e valiosas:
//   frame-ancestors 'self'  → anti-clickjacking (ninguém embute o app num iframe)
//   object-src 'none'       → sem <object>/<embed> (vetor de plugin)
//   base-uri 'self'         → bloqueia sequestro de <base> por XSS
//   form-action 'self'      → um form injetado não posta para fora
const CSP = [
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
