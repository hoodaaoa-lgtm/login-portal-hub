-- ═══════════════════════════════════════════════════════════════════════
-- FIX: perfis que ficam presos em "@utilizador" para sempre.
-- ---------------------------------------------------------------------
-- Causa raiz encontrada: para algumas contas, a linha em "public.profiles"
-- nunca chegou a ser criada (o trigger "handle_new_user", que corre ao
-- registar em auth.users, nunca correu para essas contas — normalmente
-- porque esta migration nunca tinha sido aplicada neste projeto Supabase).
-- Sem linha em profiles, o perfil.tsx não tinha nada para reparar (só
-- sabia corrigir username vazio numa linha JÁ EXISTENTE) e mostrava
-- "@utilizador" para sempre, em todos os carregamentos da página.
--
-- Este ficheiro:
--  1. Garante que o trigger existe e está correto (idempotente).
--  2. Cria a linha em profiles para QUALQUER conta em auth.users que
--     ainda não tenha uma — corrige de vez as contas já afetadas.
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. Seguro repetir.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Garante a função e o trigger de criação automática de profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, age)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'username', ''), 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'age', '')::INTEGER
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. Repara AGORA qualquer conta existente que ainda não tenha profile —
--    usa o username/full_name que a pessoa deu no registo (guardado em
--    auth.users.raw_user_meta_data), com fallback só se estiver vazio.
--    Também garante que nenhum username fica vazio ('') nas linhas já
--    existentes, evitando o mesmo sintoma por outra via.
INSERT INTO public.profiles (id, username, full_name)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'username', ''), 'user_' || substr(u.id::text, 1, 8)),
  COALESCE(u.raw_user_meta_data->>'full_name', '')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles
SET username = 'user_' || substr(id::text, 1, 8)
WHERE username IS NULL OR username = '';

COMMIT;
