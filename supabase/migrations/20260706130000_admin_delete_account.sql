-- ============================================================================
-- Moderação do Admin: eliminar contas de utilizadores por completo
-- Depende de public.is_hooda_admin(), criada em 20260705000000_official_admin_messages.sql
-- Corre este ficheiro inteiro no Supabase SQL Editor. É seguro correr mais que uma vez.
--
-- A função é SECURITY DEFINER (corre com os privilégios de quem a criou —
-- normalmente o superuser "postgres" no SQL Editor), por isso consegue
-- apagar diretamente de auth.users, algo que o cliente nunca pode fazer
-- por si (precisaria da service_role key). Ao apagar de auth.users, todas
-- as tabelas com "REFERENCES auth.users(id) ON DELETE CASCADE" (profiles,
-- posts, channels, mensagens, etc.) são limpas automaticamente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_account(target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'admin cannot delete own account through this function';
  END IF;
  DELETE FROM auth.users WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid) TO authenticated;

-- Fim.
