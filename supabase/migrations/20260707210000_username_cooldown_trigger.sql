-- Aplica no servidor o bloqueio de troca de username a cada 30 dias.
-- Até agora isto só era validado no cliente (perfil.tsx), o que significa
-- que uma chamada direta à API/RPC conseguia contornar a regra. Este
-- trigger é a fonte de verdade final e funciona independentemente do
-- cliente.

CREATE OR REPLACE FUNCTION public.enforce_username_cooldown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  days_since numeric;
  days_left integer;
BEGIN
  -- Só entra em ação se o username realmente mudou
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF OLD.username_changed_at IS NOT NULL THEN
      days_since := EXTRACT(EPOCH FROM (now() - OLD.username_changed_at)) / 86400;
      IF days_since < 30 THEN
        days_left := CEIL(30 - days_since);
        RAISE EXCEPTION 'Só podes trocar de nome de utilizador novamente em % dia(s).', days_left
          USING ERRCODE = 'P0001', HINT = 'username_cooldown';
      END IF;
    END IF;
    -- Regista a data desta troca (primeira troca sempre permitida, pois
    -- OLD.username_changed_at começa NULL)
    NEW.username_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_username_cooldown ON public.profiles;
CREATE TRIGGER trg_enforce_username_cooldown
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_username_cooldown();
