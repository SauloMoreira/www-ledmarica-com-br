-- 1) Vínculo de email_events com carrinho abandonado
ALTER TABLE public.email_events
  ADD COLUMN IF NOT EXISTS abandoned_cart_id uuid REFERENCES public.abandoned_carts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_events_abandoned_cart
  ON public.email_events (abandoned_cart_id, type, status);

-- 2) Opt-out de e-mails promocionais
CREATE TABLE IF NOT EXISTS public.email_unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  unsubscribed_at timestamptz,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.email_unsubscribes TO service_role;
ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;
-- Sem policies: acesso somente via service_role (rotas do servidor).

CREATE TRIGGER trg_email_unsubscribes_touch
  BEFORE UPDATE ON public.email_unsubscribes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- 3) Configuração interna (segredo do cron) — nunca exposta ao cliente
CREATE TABLE IF NOT EXISTS public.internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.internal_config TO service_role;
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
-- Sem policies: acesso somente via service_role.

INSERT INTO public.internal_config (key, value)
VALUES ('cron_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 4) Detecção de carrinhos abandonados passa a preencher contato do cliente logado
CREATE OR REPLACE FUNCTION public.detect_abandoned_carts(_minutes integer DEFAULT 60)
RETURNS TABLE(created_count integer, skipped_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cutoff timestamptz := now() - make_interval(mins => _minutes);
  v_created integer := 0;
  v_skipped integer := 0;
  r RECORD;
  v_subtotal numeric;
  v_count integer;
  v_snapshot jsonb;
  v_existing_id uuid;
  v_lead_id uuid;
  v_company_id uuid;
  v_recent_paid_order uuid;
  v_email text;
  v_name text;
  v_phone text;
BEGIN
  FOR r IN
    SELECT
      ci.user_id,
      ci.session_id,
      max(ci.created_at) AS last_activity,
      count(*) AS items
    FROM public.cart_items ci
    GROUP BY ci.user_id, ci.session_id
    HAVING max(ci.created_at) < v_cutoff
       AND count(*) > 0
  LOOP
    SELECT id INTO v_existing_id
    FROM public.abandoned_carts
    WHERE status IN ('novo', 'contato_enviado')
      AND (
        (r.user_id IS NOT NULL AND user_id = r.user_id)
        OR (r.user_id IS NULL AND r.session_id IS NOT NULL
            AND cart_snapshot->>'_session_id' = r.session_id)
      )
      AND abandoned_at > now() - interval '7 days'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF r.user_id IS NOT NULL THEN
      SELECT id INTO v_recent_paid_order
      FROM public.orders
      WHERE user_id = r.user_id
        AND created_at > r.last_activity - interval '5 minutes'
      LIMIT 1;
      IF v_recent_paid_order IS NOT NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
    END IF;

    SELECT
      coalesce(jsonb_agg(jsonb_build_object(
        'product_id', p.id,
        'product_name', p.name,
        'product_sku', p.sku,
        'product_slug', p.slug,
        'product_image', (CASE WHEN array_length(p.images,1) > 0 THEN p.images[1] ELSE null END),
        'qty', ci.qty,
        'unit_price', p.price,
        'subtotal', round(coalesce(p.price,0) * ci.qty, 2)
      )), '[]'::jsonb),
      coalesce(sum(coalesce(p.price,0) * ci.qty), 0),
      coalesce(sum(ci.qty), 0)
    INTO v_snapshot, v_subtotal, v_count
    FROM public.cart_items ci
    LEFT JOIN public.products p ON p.id = ci.product_id
    WHERE (ci.user_id IS NOT DISTINCT FROM r.user_id
           AND ci.session_id IS NOT DISTINCT FROM r.session_id);

    IF r.user_id IS NULL AND r.session_id IS NOT NULL THEN
      v_snapshot := v_snapshot || jsonb_build_object('_session_id', r.session_id);
    END IF;

    v_lead_id := NULL;
    v_company_id := NULL;
    v_email := NULL;
    v_name := NULL;
    v_phone := NULL;

    IF r.user_id IS NOT NULL THEN
      SELECT cu.company_id INTO v_company_id
      FROM public.company_users cu
      WHERE cu.user_id = r.user_id
      LIMIT 1;

      SELECT nullif(btrim(pr.email), ''), nullif(btrim(pr.name), ''), nullif(btrim(pr.phone), '')
        INTO v_email, v_name, v_phone
      FROM public.profiles pr
      WHERE pr.id = r.user_id
      LIMIT 1;
    END IF;

    INSERT INTO public.abandoned_carts (
      user_id, lead_id, company_id,
      customer_email, customer_name, customer_phone,
      cart_snapshot, subtotal_amount, items_count,
      status, abandoned_at, last_activity_at
    )
    VALUES (
      r.user_id, v_lead_id, v_company_id,
      v_email, v_name, v_phone,
      v_snapshot, v_subtotal, v_count,
      'novo', now(), r.last_activity
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_created, v_skipped;
END;
$fn$;

-- 5) Novos modelos de e-mail editáveis no painel
INSERT INTO public.email_templates (type, display_name, is_active, auto_send, allow_manual_resend)
VALUES
  ('payment_reminder_2h', 'Lembrete de pagamento (2h)', true, true, true),
  ('payment_reminder_24h', 'Lembrete de pagamento (24h)', true, true, true),
  ('abandoned_cart_recovery', 'Recuperação de carrinho', true, true, true)
ON CONFLICT (type) DO NOTHING;

-- 6) Disparo periódico: pg_cron -> pg_net -> rota interna do site
CREATE OR REPLACE FUNCTION public.dispatch_email_job(_job text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_secret text;
BEGIN
  SELECT value INTO v_secret FROM public.internal_config WHERE key = 'cron_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'dispatch_email_job: cron_secret ausente';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://www.ledmarica.com.br/api/public/internal/cron-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := jsonb_build_object('job', _job),
    timeout_milliseconds := 25000
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.dispatch_email_job(text) FROM public, anon, authenticated;

SELECT cron.schedule('payment-reminders-hourly', '15 * * * *', $$SELECT public.dispatch_email_job('payment_reminders');$$);
SELECT cron.schedule('abandoned-cart-recovery-hourly', '45 * * * *', $$SELECT public.dispatch_email_job('abandoned_cart_recovery');$$);