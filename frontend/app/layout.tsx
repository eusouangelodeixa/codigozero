import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import { TrackingInjector } from "@/components/TrackingInjector";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

// Brand typeface. Self-hosted by next/font (no external request, no FOUT).
// Exposed to the design system as the CSS variable --font-sora.
const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

const APP_TITLE = "Código Zero — Plataforma";
const APP_DESC =
  "Sua plataforma de prospecção, scripts, aulas e comunidade para criar micronegócios de IA — sem escrever uma linha de código.";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.czero.sbs"),
  title: {
    default: APP_TITLE,
    template: "%s · Código Zero",
  },
  description: APP_DESC,
  applicationName: "Código Zero",
  authors: [{ name: "Código Zero" }],
  keywords: [
    "código zero",
    "micronegócios",
    "inteligência artificial",
    "prospecção",
    "whatsapp",
    "moçambique",
  ],
  icons: {
    icon: [
      { url: "/favicon.png?v=5", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png?v=5", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=5", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png?v=5", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Código Zero",
  },
  openGraph: {
    title: APP_TITLE,
    description: APP_DESC,
    type: "website",
    locale: "pt_BR",
    siteName: "Código Zero",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_TITLE,
    description: APP_DESC,
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  // When the on-screen keyboard opens, resize the LAYOUT (so viewport units
  // shrink and fixed elements reflow) instead of overlaying it and scrolling
  // the document up — that scroll was distorting the chat on mobile.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)",  color: "#001412" },
    { media: "(prefers-color-scheme: light)", color: "#001412" },
  ],
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={sora.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* iOS PWA splash + theming hints */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Código Zero" />
      </head>
      <body>
        <TrackingInjector />
        <ToastProvider>{children}</ToastProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
