
CREATE OR REPLACE FUNCTION public.enforce_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean := current_user NOT IN ('authenticated','anon');
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
