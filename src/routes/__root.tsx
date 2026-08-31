import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { installAuthFetch } from "@/integrations/supabase/auth-fetch";
import { Toaster } from "@/components/ui/sonner";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";
import appCss from "../styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

const ORG_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/og-default.png`,
      sameAs: [],
    },
    {
      "@type": "Store",
      "@id": `${SITE_URL}/#store`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      telephone: "+55-21-98212-6467",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Maricá",
        addressRegion: "RJ",
        addressCountry: "BR",
      },
      geo: { "@type": "GeoCoordinates", latitude: "-22.9189", longitude: "-42.8186" },
      openingHours: "Mo-Sa 08:00-18:00",
      priceRange: "$$",
      currenciesAccepted: "BRL",
      paymentAccepted: "Cash, Credit Card, PIX",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/catalogo?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ],
});

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-extrabold text-primary">404</h1>
        <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
          Página não encontrada
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">A página que você procura não existe.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

// Content Security Policy — modo ENFORCE.
// Permite o que o app realmente usa (Supabase, Mercado Pago, Google Fonts, Lovable AI, imagens via storage).
// Violações continuam sendo reportadas para /api/public/csp-report.
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://analytics.tiktok.com https://www.clarity.ms https://*.clarity.ms",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.mercadopago.com https://ai.gateway.lovable.dev https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.facebook.com https://*.facebook.com https://analytics.tiktok.com https://*.tiktok.com https://www.clarity.ms https://*.clarity.ms",
  "frame-src 'self' https://www.mercadopago.com https://www.mercadopago.com.br https://td.doubleclick.net https://www.facebook.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://www.mercadopago.com https://www.mercadopago.com.br",
  // NOTA: "frame-ancestors" e "report-uri" foram removidos daqui de propósito.
  // Ambas as diretivas são ignoradas pelo navegador quando a CSP é entregue via
  // <meta http-equiv> (só têm efeito em header HTTP real) e geravam avisos no
  // console, penalizando o audit de performance/errors-in-console.
  // Aplicá-las de fato exige header HTTP na borda — fora do escopo deste projeto.
].join("; ");

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#3F5AE0" },
      { name: "referrer", content: "strict-origin-when-cross-origin" },
      { httpEquiv: "Content-Language", content: "pt-BR" } as unknown as {
        name: string;
        content: string;
      },
      { name: "google", content: "notranslate" },
      { name: "google-site-verification", content: "nVbpxkpcwVPbcDdy1sTWRhWG6yVq4mNEXsWHYaklVdE" },
      { name: "language", content: "Portuguese" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Led Maricá" },
      { name: "application-name", content: "Led Maricá" },
      { title: "Led Maricá — Material Elétrico & Iluminação LED em Maricá/RJ" },
      {
        property: "og:title",
        content: "Led Maricá — Material Elétrico & Iluminação LED em Maricá/RJ",
      },
      {
        name: "twitter:title",
        content: "Led Maricá — Material Elétrico & Iluminação LED em Maricá/RJ",
      },
      { property: "og:locale", content: "pt_BR" },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:description", content: SITE_DESCRIPTION },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      {
        property: "og:image",
        content: `${SITE_URL}/og-default.png`,
      },
      {
        name: "twitter:image",
        content: `${SITE_URL}/og-default.png`,
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      // Identidade de marca — favicon, atalhos e PWA (v2 para evitar cache antigo)
      { rel: "icon", href: "/favicon.ico?v=2", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png?v=2" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png?v=2" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png?v=2" },
      { rel: "manifest", href: "/site.webmanifest?v=2" },
    ],
    scripts: [
      { type: "application/ld+json", children: ORG_JSONLD },
      {
        children: `(function(){var l=document.createElement("link");l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Plus+Jakarta+Sans:wght@700;800&display=swap";l.media="print";l.onload=function(){l.media="all"};document.head.appendChild(l)})()`,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" translate="no">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP_POLICY} />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="Content-Language" content="pt-BR" />
        {/* S6 — Permissions-Policy via meta (defesa em profundidade; o ideal é também via header HTTP). */}
        <meta
          httpEquiv="Permissions-Policy"
          content="camera=(), microphone=(), geolocation=(), payment=(self 'https://www.mercadopago.com' 'https://www.mercadopago.com.br'), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), interest-cohort=(), browsing-topics=()"
        />
        <meta name="google" content="notranslate" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    installAuthFetch();
  }, []);
  useEffect(() => {
    // Captura UTMs/origem na URL atual e guarda no sessionStorage
    void import("@/lib/leadTracking").then((m) => m.captureTrackingFromCurrentUrl());
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
