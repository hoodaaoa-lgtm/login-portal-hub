-- ───────────────────────────────────────────────────────────────────────
-- Cadastro simplificado: nome, username, gmail, categorias do canal,
-- senha/confirmar senha. Ao criar conta, o utilizador entra logo (sem
-- ecrã bloqueante de "confirma o teu email") e recebe uma notificação
-- no sino pedindo para verificar o Gmail.
-- ───────────────────────────────────────────────────────────────────────

-- 1. Coluna de categorias de interesse do canal (ex: musica, anime, dorama)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS categorias text[] NOT NULL DEFAULT '{}';

-- 2. Atualiza handle_new_user: agora também grava categorias vindas do
--    cadastro, e cria uma notificação pedindo para verificar o Gmail.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_categorias text[];
BEGIN
  -- raw_user_meta_data.categorias vem como array JSON (ex: ["musica","anime"])
  BEGIN
    SELECT COALESCE(array_agg(value::text), '{}')
      INTO v_categorias
      FROM jsonb_array_elements_text(
        COALESCE(NEW.raw_user_meta_data->'categorias', '[]'::jsonb)
      ) AS value;
  EXCEPTION WHEN OTHERS THEN
    v_categorias := '{}';
  END;

  INSERT INTO public.profiles (id, username, full_name, age, categorias)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'username', ''), 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'age', '')::INTEGER,
    COALESCE(v_categorias, '{}')
  )
  ON CONFLICT (id) DO UPDATE SET categorias = EXCLUDED.categorias;

  -- Notificação para lembrar de verificar o Gmail (tipo 'system', já
  -- aparece no sino de notificações normalmente).
  INSERT INTO public.notifications (user_id, type)
  VALUES (NEW.id, 'system');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. Login flexível: permite entrar com nome de utilizador (além de Gmail
--    e Google). Como o email fica em auth.users (não acessível pelo
--    cliente), esta função devolve o email correspondente a um username,
--    só para uso no ecrã de login (antes de autenticar).
CREATE OR REPLACE FUNCTION public.email_por_username(p_username text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
BEGIN
  SELECT u.email INTO v_email
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(p.username) = lower(p_username)
  LIMIT 1;
  RETURN v_email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.email_por_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_por_username(text) TO anon, authenticated;
