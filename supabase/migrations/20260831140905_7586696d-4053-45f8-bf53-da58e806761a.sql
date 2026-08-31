-- Remove política insegura: permitia inserir vínculo em QUALQUER company_id
DROP POLICY IF EXISTS company_users_self_insert ON public.company_users;

-- Cliente não pode mais criar/alterar vínculos diretamente pela Data API.
REVOKE INSERT, UPDATE, DELETE ON public.company_users FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.company_users FROM anon;
GRANT SELECT ON public.company_users TO authenticated;
GRANT ALL ON public.company_users TO service_role;