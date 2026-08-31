
-- 1) Força role padrão no INSERT vindo do cliente
CREATE OR REPLACE FUNCTION public.enforce_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean := current_user IN ('service_role','postgres','supabase_admin');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_privileged THEN
      NEW.role := 'customer';
    ELSE
      NEW.role := COALESCE(NEW.role, 'customer');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF is_privileged THEN
      RETURN NEW;
    END IF;
    IF auth.uid() = OLD.id THEN
      RAISE EXCEPTION 'Não é permitido alterar o próprio nível de acesso'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o nível de acesso'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_role ON public.profiles;
CREATE TRIGGER trg_enforce_profile_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role();

-- 2) Grants mínimos
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
