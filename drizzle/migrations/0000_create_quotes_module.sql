CREATE TABLE public.quote_counters (
  year int PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 0
);
GRANT ALL ON public.quote_counters TO service_role;
ALTER TABLE public.quote_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quote_counters admin all" ON public.quote_counters FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_counters TO authenticated;

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  year int NOT NULL,
  seq int NOT NULL,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  negotiation_id uuid NULL REFERENCES public.b2b_negotiations(id) ON DELETE SET NULL,
  client_legal_name text NOT NULL,
  client_trade_name text,
  client_cnpj text NOT NULL,
  client_state_registration text,
  client_contact_name text,
  client_phone text,
  client_email text,
  client_address text,
  client_reference text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado','aprovado','recusado','expirado','convertido')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  validity_hours int NOT NULL DEFAULT 24 CHECK (validity_hours BETWEEN 1 AND 720),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  commercial_discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (commercial_discount_pct BETWEEN 0 AND 100),
  freight_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (freight_amount >= 0),
  pix_discount_pct numeric(5,2) NOT NULL DEFAULT 5 CHECK (pix_discount_pct BETWEEN 0 AND 100),
  subtotal_gross numeric(12,2) NOT NULL DEFAULT 0,
  items_discount_total numeric(12,2) NOT NULL DEFAULT 0,
  commercial_discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  total_pix numeric(12,2) NOT NULL DEFAULT 0,
  terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_notes text,
  seller_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, seq)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotes admin select" ON public.quotes FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "quotes admin insert" ON public.quotes FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "quotes admin update" ON public.quotes FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "quotes admin delete" ON public.quotes FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  specs text,
  ncm text,
  unit text NOT NULL DEFAULT 'pç',
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;
GRANT ALL ON public.quote_items TO service_role;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quote_items admin select" ON public.quote_items FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "quote_items admin insert" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "quote_items admin update" ON public.quote_items FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "quote_items admin delete" ON public.quote_items FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX quotes_status_idx ON public.quotes(status);
CREATE INDEX quotes_company_idx ON public.quotes(company_id);
CREATE INDEX quotes_issued_at_idx ON public.quotes(issued_at DESC);
CREATE INDEX quote_items_quote_idx ON public.quote_items(quote_id);

CREATE OR REPLACE FUNCTION public.quotes_compute_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.expires_at := NEW.issued_at + make_interval(hours => NEW.validity_hours);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER quotes_compute_expiry_trg BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_compute_expiry();

CREATE OR REPLACE FUNCTION public.next_quote_number(_year int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _seq int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  INSERT INTO public.quote_counters(year, last_seq) VALUES (_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_seq = public.quote_counters.last_seq + 1
  RETURNING last_seq INTO _seq;
  RETURN 'LM-' || _year::text || '-' || lpad(_seq::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_quote_number(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_quote_number(int) TO authenticated, service_role;