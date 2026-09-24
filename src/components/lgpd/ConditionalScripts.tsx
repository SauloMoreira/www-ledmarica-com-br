import { useEffect, useState } from "react";
import { useCookieStore } from "@/stores/cookieStore";
import { supabase } from "@/integrations/supabase/client";
import { getGtag, markGoogleTagsReady, updateConsentMode } from "@/lib/tracking";

// Provedores do Google suportam Consent Mode v2: a tag pode (e deve) ser
// carregada sempre, em toda visita — é o próprio Google quem decide, via
// gtag('consent', ...), se grava cookie/coleta dado real ou só registra um
// "ping" anônimo. Isso é o que faz o Google Ads/Analytics *detectar* a tag
// instalada, mesmo antes do usuário decidir sobre os cookies. Os demais
// provedores (Meta, TikTok, Clarity) não têm um modo equivalente amplamente
// suportado, então continuam só carregando após consentimento explícito.
const GOOGLE_CONSENT_MODE_PROVIDERS: Provider[] = ["ga4", "google_ads"];

type Provider = "ga4" | "gtm" | "meta_pixel" | "tiktok_pixel" | "clarity" | "google_ads";
type ConsentCategory = "analytics" | "marketing";

interface IntegrationRow {
  id: string;
  provider: Provider;
  account_id: string;
  consent_category: ConsentCategory;
}

const ID_PATTERNS: Record<Provider, RegExp> = {
  ga4: /^G-[A-Z0-9]{6,}$/i,
  gtm: /^GTM-[A-Z0-9]{4,}$/i,
  meta_pixel: /^[0-9]{6,20}$/,
  tiktok_pixel: /^[A-Z0-9]{15,30}$/i,
  clarity: /^[a-z0-9]{6,20}$/i,
  google_ads: /^AW-[0-9]{6,}$/i,
};

function isValid(provider: Provider, accountId: string) {
  return ID_PATTERNS[provider].test(accountId.trim());
}

function inject(id: string, build: () => HTMLScriptElement) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = build();
  el.id = id;
  document.head.appendChild(el);
}

// `gtag('js')` deve rodar uma única vez por página; `config` uma vez por ID.
// Os comandos são enfileirados ANTES do script carregar (padrão oficial do
// Google): o gtag.js processa a fila quando termina de baixar.
let gtagJsQueued = false;
const configuredGoogleIds = new Set<string>();

function configureGoogleTag(accountId: string, config?: Record<string, unknown>) {
  if (configuredGoogleIds.has(accountId)) return;
  const gtag = getGtag();
  if (!gtagJsQueued) {
    gtag("js", new Date());
    gtagJsQueued = true;
  }
  gtag("config", accountId, config);
  configuredGoogleIds.add(accountId);
}

function loadGtagScript(accountId: string, prefix: string) {
  inject(`${prefix}-${accountId}`, () => {
    const s = document.createElement("script");
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(accountId)}`;
    s.async = true;
    return s;
  });
}

function loadGa4(accountId: string) {
  configureGoogleTag(accountId, { cookie_flags: "SameSite=None;Secure" });
  loadGtagScript(accountId, "lm-ga");
}

function loadGtm(accountId: string) {
  inject(`lm-gtm-${accountId}`, () => {
    const s = document.createElement("script");
    s.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${accountId}');`;
    return s;
  });
}

function loadMetaPixel(accountId: string) {
  inject(`lm-meta-${accountId}`, () => {
    const s = document.createElement("script");
    s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${accountId}');fbq('track','PageView');`;
    return s;
  });
}

function loadTiktokPixel(accountId: string) {
  inject(`lm-tiktok-${accountId}`, () => {
    const s = document.createElement("script");
    s.innerHTML = `!function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${accountId}');ttq.page();}(window, document, 'ttq');`;
    return s;
  });
}

function loadClarity(accountId: string) {
  inject(`lm-clarity-${accountId}`, () => {
    const s = document.createElement("script");
    s.innerHTML = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${accountId}");`;
    return s;
  });
}

function loadGoogleAds(accountId: string) {
  // allow_enhanced_conversions: habilita o envio do `user_data` (e-mail/telefone
  // com hash) junto da conversão de compra — Conversões Otimizadas.
  configureGoogleTag(accountId, { allow_enhanced_conversions: true });
  loadGtagScript(accountId, "lm-gads");
}

function loadProvider(row: IntegrationRow) {
  if (!isValid(row.provider, row.account_id)) {
    if (import.meta.env.DEV)
      console.warn("[Integrations] ID inválido", row.provider, row.account_id);
    return;
  }
  const id = row.account_id.trim();
  switch (row.provider) {
    case "ga4":
      return loadGa4(id);
    case "gtm":
      return loadGtm(id);
    case "meta_pixel":
      return loadMetaPixel(id);
    case "tiktok_pixel":
      return loadTiktokPixel(id);
    case "clarity":
      return loadClarity(id);
    case "google_ads":
      return loadGoogleAds(id);
  }
}

export function ConditionalScripts() {
  const { consented, preferences } = useCookieStore();
  const [integrations, setIntegrations] = useState<IntegrationRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("marketing_integrations")
          .select("id, provider, account_id, consent_category")
          .eq("enabled", true);
        if (error) throw error;
        if (!cancelled) setIntegrations((data ?? []) as IntegrationRow[]);
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Integrations] failed to load", e);
        if (!cancelled) setIntegrations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tags do Google: carregam sempre, independente de consentimento — o
  // Consent Mode v2 (default "denied" definido no <head>) já garante que
  // nenhum dado real é coletado até o usuário aceitar. Isso é o que faz a
  // tag ficar "detectável" pelo Google Ads/Analytics em qualquer visita.
  useEffect(() => {
    if (!integrations || typeof document === "undefined") return;
    for (const row of integrations) {
      if (!GOOGLE_CONSENT_MODE_PROVIDERS.includes(row.provider)) continue;
      loadProvider(row);
    }
    markGoogleTagsReady();
  }, [integrations]);

  // Demais provedores (Meta, TikTok, Clarity): continuam só carregando
  // depois de consentimento explícito na categoria correspondente.
  useEffect(() => {
    if (!consented || !integrations || typeof document === "undefined") return;
    for (const row of integrations) {
      if (GOOGLE_CONSENT_MODE_PROVIDERS.includes(row.provider)) continue;
      const allowed =
        (row.consent_category === "analytics" && preferences.analytics) ||
        (row.consent_category === "marketing" && preferences.marketing);
      if (!allowed) continue;
      loadProvider(row);
    }
    if (preferences.personalization) window.__LM_PERSONALIZATION = true;
  }, [consented, preferences, integrations]);

  // Propaga a decisão do usuário para o Google Consent Mode v2 assim que ele
  // aceita/rejeita/ajusta as preferências — atualiza o dataLayer já criado
  // pelo script inline do <head>, liberando (ou não) a coleta real de dados
  // nas tags do Google que já estão carregadas na página.
  useEffect(() => {
    if (!consented) return;
    updateConsentMode({ analytics: preferences.analytics, marketing: preferences.marketing });
  }, [consented, preferences.analytics, preferences.marketing]);

  return null;
}
