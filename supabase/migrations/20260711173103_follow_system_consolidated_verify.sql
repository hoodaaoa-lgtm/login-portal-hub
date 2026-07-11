-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO + CONSOLIDAÇÃO FINAL do sistema de "Acompanhar".
-- ---------------------------------------------------------------------
-- Porquê este ficheiro, se já existem 20260708000000_follow_system_
-- final_fix.sql e 20260709200000_fix_follow_counts_column_grant.sql?
--
-- Porque o histórico do repo mostra VÁRIAS migrações a corrigir a MESMA
-- policy de leitura em "follows" (20260626, 20260704, 20260705,
-- 20260707110000, 20260708000000) — sinal de que, em algum momento, uma
-- policy restritiva foi recriada por cima da correta. Se alguma destas
-- migrações não tiver sido corrida no SQL Editor do Supabase (são
-- manuais, é fácil saltar uma), o SELECT feito por fetchFollowStatus()
-- falha silenciosamente por RLS: o INSERT continua a funcionar (grava
-- certo, contador sobe certo via trigger SECURITY DEFINER, que ignora
-- RLS), mas o "já sigo?" nunca é confirmado com sucesso — exatamente o
-- sintoma reportado (grava certo, botão não mantém estado).
--
-- Este ficheiro reafirma TUDO de uma vez, do zero, para garantir que o
-- estado final da BD está correto independentemente de quais das
-- migrações anteriores já correram. 100% idempotente — corre à vontade.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Restrição única (evita seguir a mesma pessoa 2x).
DELETE FROM public.follows a USING public.follows b
WHERE a.ctid < b.ctid
  AND a.follower_id = b.follower_id
  AND a.target_username = b.target_username;

ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_follower_target_unique;
ALTER TABLE public.follows ADD CONSTRAINT follows_follower_target_unique
  UNIQUE (follower_id, target_username);

-- 2. Colunas de contagem em profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;

-- 3. Recalcula contadores a partir dos dados reais (corrige qualquer drift).
UPDATE public.profiles p SET
  followers_count = COALESCE((SELECT COUNT(*) FROM public.follows f WHERE f.target_username = p.username), 0),
  following_count = COALESCE((SELECT COUNT(*) FROM public.follows f WHERE f.follower_id = p.id
                                AND EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.username = f.target_username)), 0);

-- 4. GRANT explícito nas colunas de contagem — profiles usa whitelist de
--    colunas (ver 20260627085510), e followers_count/following_count
--    foram criadas DEPOIS dessa whitelist. Sem isto, o SELECT direto a
--    estas 2 colunas dá 403 mesmo com a policy de RLS certa.
GRANT SELECT (followers_count, following_count) ON public.profiles TO authenticated, anon;

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

-- 6. RPC atómica usada por toda a app para seguir/deixar de seguir.
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
  IF p_target_username = (SELECT username FROM public.profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Não podes seguir-te a ti próprio';
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

-- 7. RLS de "follows" — reafirmada do ZERO, sem depender de nenhuma
--    versão anterior da policy ainda estar em vigor.
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
GRANT SELECT ON public.follows TO anon;
GRANT ALL ON public.follows TO service_role;

-- 8. Realtime em follows/profiles — seguir num sítio reflete nos outros.
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.follows; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 9. Diagnóstico: mostra no output do SQL Editor quantas linhas de
--    "follows" existem e confirma que a policy de leitura está ativa.
--    Não afeta dados — só para confirmares visualmente que correu bem.
DO $$
DECLARE
  v_count INTEGER;
  v_policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.follows;
  SELECT COUNT(*) INTO v_policy_count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'follows' AND cmd = 'SELECT';
  RAISE NOTICE 'follows: % linha(s) na tabela, % policy(ies) de SELECT ativa(s)', v_count, v_policy_count;
END $$;

COMMIT;
