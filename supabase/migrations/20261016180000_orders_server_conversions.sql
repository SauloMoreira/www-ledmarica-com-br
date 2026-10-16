-- Conversões de compra pelo servidor (Meta API de Conversões + GA4 Measurement Protocol).
-- ad_attribution: identificadores de anúncio e consentimento LGPD capturados no checkout.
-- server_conversions: resultado do envio por canal (idempotência e auditoria).
-- Colunas opcionais: pedidos antigos e o fluxo atual continuam funcionando sem elas preenchidas.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ad_attribution jsonb,
  ADD COLUMN IF NOT EXISTS server_conversions jsonb;

COMMENT ON COLUMN public.orders.ad_attribution IS
  'Identificadores de anúncio (fbp, fbc, ga_client_id, ga_session_id, user agent, IP) e consentimento LGPD no checkout. Identificadores só são gravados com o consentimento da categoria.';
COMMENT ON COLUMN public.orders.server_conversions IS
  'Resultado do envio da compra pelo servidor: { meta: {status, reason, at}, ga4: {...} }.';
