-- ============================================================================
-- Moderação do Admin: banir/verificar utilizadores + gerir denúncias
-- Depende de public.is_hooda_admin(), criada em 20260705000000_official_admin_messages.sql
-- Corre este ficheiro inteiro no Supabase SQL Editor. É seguro correr mais que uma vez.
-- ============================================================================

-- 1) Novas colunas em profiles (moderação)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason  text,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- 2) Só o admin pode alterar is_banned / ban_reason / is_verified — mesmo que
--    o próprio dono da conta consiga fazer UPDATE ao resto do seu perfil,
--    estes 3 campos ignoram qualquer alteração que não venha do admin.
CREATE OR REPLACE FUNCTION public.protect_admin_only_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    NEW.is_banned   := OLD.is_banned;
    NEW.ban_reason  := OLD.ban_reason;
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_only_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_admin_only_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_admin_only_profile_fields();

-- 3) Admin pode fazer UPDATE a qualquer perfil (a política existente só
--    deixa cada utilizador editar o seu próprio perfil; esta soma-se a ela).
DROP POLICY IF EXISTS "admin update any profile" ON public.profiles;
CREATE POLICY "admin update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ( public.is_hooda_admin() )
  WITH CHECK ( public.is_hooda_admin() );

-- 4) Admin lê e resolve todas as denúncias (a política existente só deixa
--    o denunciante e o denunciado verem a denúncia).
DROP POLICY IF EXISTS "admin read all reports" ON public.user_reports;
CREATE POLICY "admin read all reports" ON public.user_reports
  FOR SELECT TO authenticated
  USING ( public.is_hooda_admin() );

DROP POLICY IF EXISTS "admin update reports" ON public.user_reports;
CREATE POLICY "admin update reports" ON public.user_reports
  FOR UPDATE TO authenticated
  USING ( public.is_hooda_admin() )
  WITH CHECK ( public.is_hooda_admin() );

-- Fim.
