-- ATENÇÃO: arquivo guardado em docs/ de propósito para NÃO ser aplicado junto
-- com o merge. Aplicar somente DEPOIS que o código desta branch estiver
-- publicado (ver PR). Para aplicar, mover para supabase/migrations/ num PR
-- separado ou executar no SQL do Supabase.

-- Integridade de pedidos e pagamentos.
--
-- Antes: as políticas orders_owner_insert e order_items_insert permitiam que
-- qualquer cliente logado inserisse, direto pela API do Supabase, um pedido
-- próprio com payment_status/status/total arbitrários (ex.: 'approved') e itens
-- com preço escolhido por ele, sem passar pela validação de preços do servidor.
--
-- Agora: pedidos e itens são criados apenas pelo servidor (service role) na
-- função createOrder, que recalcula preços e totais. Leitura pelo dono e
-- atualização pelo admin continuam como estavam.
--
-- ORDEM DE APLICAÇÃO: publicar primeiro o código que grava via service role;
-- só então aplicar esta migração. Aplicada antes, o checkout deixa de criar
-- pedidos.

DROP POLICY IF EXISTS "orders_owner_insert" ON public.orders;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;

-- Defesa adicional: mesmo que uma política de INSERT seja recriada no futuro,
-- usuários da API pública (anon/authenticated) não conseguem inserir pedidos.
-- O servidor (service_role) e a manutenção direta no banco não são afetados.
CREATE OR REPLACE FUNCTION public.guard_client_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Pedidos só podem ser criados pelo servidor da loja';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_client_order_insert ON public.orders;
CREATE TRIGGER trg_guard_client_order_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_order_insert();
