-- Checkout: documento fiscal do comprador pode ser CPF (pessoa física) OU
-- CNPJ (empresa/MEI comprando no varejo, sem cadastro B2B).
--
-- orders.customer_cpf continua existindo (compatibilidade com pedidos antigos
-- e relatórios). Os novos campos são snapshot imutável do momento da compra,
-- no mesmo padrão de company_cnpj / address_snapshot.

-- ---------- orders ----------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_document_type text,
  ADD COLUMN IF NOT EXISTS customer_cnpj text,
  ADD COLUMN IF NOT EXISTS customer_legal_name text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_customer_document_type_chk,
  ADD CONSTRAINT orders_customer_document_type_chk
    CHECK (customer_document_type IS NULL OR customer_document_type IN ('cpf', 'cnpj'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_customer_cnpj_format_chk,
  ADD CONSTRAINT orders_customer_cnpj_format_chk
    CHECK (customer_cnpj IS NULL OR customer_cnpj ~ '^[0-9]{14}$');

-- Coerência: o tipo declarado precisa vir com o documento correspondente.
-- Pedidos antigos (tipo NULL) não são afetados.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_customer_document_consistency_chk,
  ADD CONSTRAINT orders_customer_document_consistency_chk
    CHECK (
      customer_document_type IS NULL
      OR (customer_document_type = 'cpf' AND customer_cpf IS NOT NULL)
      OR (
        customer_document_type = 'cnpj'
        AND customer_cnpj IS NOT NULL
        AND length(btrim(coalesce(customer_legal_name, ''))) >= 2
      )
    );

-- Pedidos já existentes com CPF passam a declarar o tipo.
UPDATE public.orders
   SET customer_document_type = 'cpf'
 WHERE customer_document_type IS NULL
   AND customer_cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_customer_cnpj_idx
  ON public.orders (customer_cnpj)
  WHERE customer_cnpj IS NOT NULL;

-- ---------- profiles (pré-preenchimento da próxima compra) ----------
-- Sem índice único: vários funcionários podem comprar pelo mesmo CNPJ.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_document_type text,
  ADD COLUMN IF NOT EXISTS billing_cnpj text,
  ADD COLUMN IF NOT EXISTS billing_legal_name text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_billing_document_type_chk,
  ADD CONSTRAINT profiles_billing_document_type_chk
    CHECK (billing_document_type IS NULL OR billing_document_type IN ('cpf', 'cnpj'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_billing_cnpj_format_chk,
  ADD CONSTRAINT profiles_billing_cnpj_format_chk
    CHECK (billing_cnpj IS NULL OR billing_cnpj ~ '^[0-9]{14}$');
