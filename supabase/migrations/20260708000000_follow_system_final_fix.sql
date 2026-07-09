-- ═══════════════════════════════════════════════════════════════════════
-- FIX DEFINITIVO do sistema de "seguir" (pessoas e canais) — idempotente.
-- Corre este ficheiro inteiro no SQL Editor do Supabase. Podes correr
-- quantas vezes quiseres, nunca duplica nem apaga dados.
--
-- Isto resolve o lado da BASE DE DADOS. O lado do CÓDIGO (a app tinha
-- 4 implementações diferentes de "seguir" que não se sincronizavam entre
-- si, e uma delas confundia "seguir canal" com "seguir pessoa") já foi
-- corrigido nos ficheiros da app nesta mesma sessão.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Remove duplicados em "follows" antes da restrição única.
DELETE FROM public.follows a USING public.follows b
WHERE a.ctid < b.ctid
  AND a.follower_id = b.follower_id
  AND a.target_username = b.target_username;

ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_follower_target_unique;
ALTER TABLE public.follows ADD CONSTRAINT follows_follower_target_unique
  UNIQUE (follower_id, target_username);

-- 2. Colunas de contagem em profiles (idempotente).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;

-- 3. Recalcula contadores a partir dos dados reais.
UPDATE public.profiles p SET
  followers_count = COALESCE((SELECT COUNT(*) FROM public.follows f WHERE f.target_username = p.username), 0),
  following_count = COALESCE((SELECT COUNT(*) FROM public.follows f WHERE f.follower_id = p.id
                                AND EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.username = f.target_username)), 0);

-- 4. Backfill de following_id — algumas partes antigas do código (já
--    corrigidas) inseriam follows sem preencher esta coluna, o que
--    quebrava as verificações de permissão de mensagens ("só seguidores"
--    / "seguimento mútuo"). Preenche em qualquer linha ainda em falta.
UPDATE public.follows f SET following_id = p.id
FROM public.profiles p
WHERE p.username = f.target_username AND f.following_id IS NULL;

-- 5. Trigger que mantém os contadores sempre sincronizados.
CREATE OR REPLACE FUNCTION public.handle_follow_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE username = NEW.target_username;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = NEW.target_username) THEN
      UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE username = OLD.target_username;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = OLD.target_username) THEN
      UPDATE public.profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_change ON public.follows;
CREATE TRIGGER trg_follow_change
AFTER INSERT OR DELETE ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.handle_follow_change();

-- 6. RPC atómica usada por TODA a app agora (UniversalPostCard, perfil,
--    RightSidebar, explorar, modal de seguidores/seguindo).
CREATE OR REPLACE FUNCTION public.toggle_follow(p_target_username TEXT, p_target_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
  v_followers_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_target_username IS NULL OR p_target_username = '' THEN
    RAISE EXCEPTION 'target_username obrigatório';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_id = v_uid AND target_username = p_target_username) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.follows WHERE follower_id = v_uid AND target_username = p_target_username;
  ELSE
    INSERT INTO public.follows (follower_id, target_username, following_id)
    VALUES (v_uid, p_target_username, p_target_id)
    ON CONFLICT (follower_id, target_username) DO NOTHING;
  END IF;

  SELECT followers_count INTO v_followers_count FROM public.profiles WHERE username = p_target_username;

  RETURN jsonb_build_object(
    'following', NOT v_exists,
    'followers_count', COALESCE(v_followers_count, 0)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_follow(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_follow(TEXT, UUID) TO authenticated;

-- 7. RLS de leitura em "follows" — sem isto, contadores e o botão
--    "Seguir"/"A seguir" ficam presos a 0 / desatualizados para todos.
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows read" ON public.follows;
DROP POLICY IF EXISTS "follows read public" ON public.follows;
DROP POLICY IF EXISTS "follows_select_all" ON public.follows;
CREATE POLICY "follows_select_all" ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "follows insert own" ON public.follows;
CREATE POLICY "follows insert own" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows delete own" ON public.follows;
CREATE POLICY "follows delete own" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;

-- 8. Mesma garantia de RLS para "channel_follows" (seguir CANAIS — tabela
--    separada de propósito, para não colidir com usernames de pessoas).
--    Só corre se a tabela ainda existir (pode já ter sido removida quando
--    os canais foram unificados nos perfis).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channel_follows') THEN
    ALTER TABLE public.channel_follows ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "cf public read" ON public.channel_follows;
    CREATE POLICY "cf public read" ON public.channel_follows FOR SELECT USING (true);
    DROP POLICY IF EXISTS "cf self insert" ON public.channel_follows;
    CREATE POLICY "cf self insert" ON public.channel_follows FOR INSERT WITH CHECK (auth.uid() = user_id);
    DROP POLICY IF EXISTS "cf self delete" ON public.channel_follows;
    CREATE POLICY "cf self delete" ON public.channel_follows FOR DELETE USING (auth.uid() = user_id);
    GRANT SELECT, INSERT, DELETE ON public.channel_follows TO authenticated;
    GRANT SELECT ON public.channel_follows TO anon;
    GRANT ALL ON public.channel_follows TO service_role;
  END IF;
END $$;

-- 9. Realtime em follows, profiles e channel_follows — seguir num
--    dispositivo/aba reflete automaticamente nos outros.
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.follows; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channel_follows') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_follows; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

COMMIT;
