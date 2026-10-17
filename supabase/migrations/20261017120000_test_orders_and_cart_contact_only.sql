-- Pedidos e carrinhos de teste fora dos números + carrinho abandonado só com contato.
--
-- 1) orders.is_test: marcado pelo servidor no checkout quando o navegador está em
--    "modo teste" (cookie lm_modo_teste) ou o usuário é admin. Pedidos de teste
--    ficam fora dos relatórios, do CRM e das conversões enviadas ao Google/Meta.
-- 2) detect_abandoned_carts: deixa de registrar carrinho sem e-mail/telefone
--    (não há a quem avisar) e carrinho de conta admin. Se o visitante deixar o
--    contato depois, o carrinho é registrado na rodada seguinte.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.is_test IS
  'Pedido da equipe (modo teste ou conta admin). Fora de relatórios, CRM e conversões de anúncios.';

CREATE INDEX IF NOT EXISTS orders_is_test_idx ON public.orders (is_test) WHERE is_test;

-- Testes já conhecidos (16/10/2026: pedidos de R$ 1,99 da conta da equipe).
UPDATE public.orders SET is_test = true WHERE order_number IN (31, 32);

CREATE OR REPLACE FUNCTION public.detect_abandoned_carts(_minutes integer DEFAULT 60)
 RETURNS TABLE(created_count integer, skipped_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := now() - make_interval(mins => _minutes);
  v_created integer := 0; v_skipped integer := 0;
  r RECORD; v_subtotal numeric; v_count integer; v_snapshot jsonb;
  v_prev RECORD; v_lead_id uuid; v_company_id uuid; v_recent_paid_order uuid;
  v_email text; v_name text; v_phone text;
BEGIN
  FOR r IN
    SELECT ci.user_id, ci.session_id, max(ci.created_at) AS last_activity, count(*) AS items
    FROM public.cart_items ci
    GROUP BY ci.user_id, ci.session_id
    HAVING max(ci.created_at) < v_cutoff AND count(*) > 0
  LOOP
    -- Conta da equipe nunca vira carrinho abandonado.
    IF r.user_id IS NOT NULL AND public.is_admin(r.user_id) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    -- Registro mais recente deste carrinho (qualquer status, qualquer idade).
    v_prev := NULL;
    SELECT id, abandoned_at, last_activity_at, status, recovered_at, converted_order_id
      INTO v_prev
      FROM public.abandoned_carts
     WHERE (r.user_id IS NOT NULL AND user_id = r.user_id)
        OR (r.user_id IS NULL AND r.session_id IS NOT NULL AND session_id = r.session_id)
     ORDER BY abandoned_at DESC
     LIMIT 1;

    -- Sem atividade nova desde a última detecção => é o MESMO abandono. Nunca recria.
    IF v_prev.id IS NOT NULL AND r.last_activity <= COALESCE(v_prev.last_activity_at, v_prev.abandoned_at) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    IF r.user_id IS NOT NULL THEN
      v_recent_paid_order := NULL;
      SELECT id INTO v_recent_paid_order FROM public.orders
      WHERE user_id = r.user_id AND created_at > r.last_activity - interval '5 minutes' LIMIT 1;
      IF v_recent_paid_order IS NOT NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    END IF;

    SELECT
      coalesce(jsonb_agg(jsonb_build_object(
        'product_id', p.id, 'product_name', p.name, 'product_sku', p.sku, 'product_slug', p.slug,
        'product_image', (CASE WHEN array_length(p.images,1) > 0 THEN p.images[1] ELSE null END),
        'qty', ci.qty, 'unit_price', p.price,
        'subtotal', round(coalesce(p.price,0) * ci.qty, 2)
      )) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb),
      coalesce(sum(coalesce(p.price,0) * ci.qty) FILTER (WHERE p.id IS NOT NULL), 0),
      coalesce(sum(ci.qty) FILTER (WHERE p.id IS NOT NULL), 0)
    INTO v_snapshot, v_subtotal, v_count
    FROM public.cart_items ci
    LEFT JOIN public.products p ON p.id = ci.product_id
    WHERE ci.user_id IS NOT DISTINCT FROM r.user_id AND ci.session_id IS NOT DISTINCT FROM r.session_id;

    IF jsonb_array_length(v_snapshot) = 0 THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    v_lead_id := NULL; v_company_id := NULL; v_email := NULL; v_name := NULL; v_phone := NULL;
    IF r.user_id IS NOT NULL THEN
      SELECT cu.company_id INTO v_company_id FROM public.company_users cu WHERE cu.user_id = r.user_id LIMIT 1;
      SELECT nullif(btrim(pr.email),''), nullif(btrim(pr.name),''), nullif(btrim(pr.phone),'')
        INTO v_email, v_name, v_phone FROM public.profiles pr WHERE pr.id = r.user_id LIMIT 1;
    ELSIF r.session_id IS NOT NULL THEN
      SELECT nullif(btrim(gc.email),''), nullif(btrim(gc.name),''), nullif(btrim(gc.phone),''), gc.lead_id
        INTO v_email, v_name, v_phone, v_lead_id FROM public.guest_cart_contacts gc WHERE gc.session_id = r.session_id LIMIT 1;
    END IF;

    -- Sem e-mail nem telefone não há a quem avisar: não registra.
    IF v_email IS NULL AND v_phone IS NULL THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    -- Atividade nova num carrinho já registrado e ainda não recuperado/convertido:
    -- atualiza o MESMO registro (1 linha por visitante) em vez de criar outra.
    IF v_prev.id IS NOT NULL AND v_prev.recovered_at IS NULL AND v_prev.converted_order_id IS NULL
       AND v_prev.status <> 'recuperado' THEN
      UPDATE public.abandoned_carts SET
        cart_snapshot = v_snapshot, subtotal_amount = v_subtotal, items_count = v_count,
        customer_email = COALESCE(v_email, customer_email),
        customer_name = COALESCE(v_name, customer_name),
        customer_phone = COALESCE(v_phone, customer_phone),
        company_id = COALESCE(v_company_id, company_id),
        lead_id = COALESCE(v_lead_id, lead_id),
        status = 'novo', abandoned_at = now(), last_activity_at = r.last_activity,
        notes = CASE WHEN v_prev.status = 'novo' THEN notes
                     ELSE concat_ws(E'\n', notes, 'Voltou a ter atividade em ' || to_char(r.last_activity AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' (antes: ' || v_prev.status || ')') END,
        updated_at = now()
      WHERE id = v_prev.id;
      v_created := v_created + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.abandoned_carts (user_id, session_id, lead_id, company_id,
      customer_email, customer_name, customer_phone, cart_snapshot, subtotal_amount, items_count,
      status, abandoned_at, last_activity_at)
    VALUES (r.user_id, CASE WHEN r.user_id IS NULL THEN r.session_id END, v_lead_id, v_company_id,
      v_email, v_name, v_phone, v_snapshot, v_subtotal, v_count, 'novo', now(), r.last_activity);
    v_created := v_created + 1;
  END LOOP;
  RETURN QUERY SELECT v_created, v_skipped;
END;
$function$;
