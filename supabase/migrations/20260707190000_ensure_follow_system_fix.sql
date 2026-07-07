-- ═══════════════════════════════════════════════════════════════════════
-- GARANTIR o fix do sistema de "seguir" — versão idempotente.
-- Esta migração pode ser corrida em segurança mesmo que a anterior
-- (20260707130000_unified_social_system.sql) já tenha sido aplicada:
-- todos os passos usam IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS,
-- por isso nunca falha por "já existe" e nunca duplica dados.
--
-- Objetivo: eliminar de vez o bug em que o botão "Seguir" aparecia
-- errado (mostrava "Seguir" mesmo já a seguir) e o clique falhava
-- silenciosamente por a relação já existir na BD.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Remove duplicados que possam existir em "follows" antes de criar a
--    restrição única (sem isto, o ADD CONSTRAINT abaixo falha).
DELETE FROM public.follows a USING public.follows b
WHERE a.ctid < b.ctid
  AND a.follower_id = b.follower_id
  AND a.target_username = b.target_username;

-- 2. Restrição única — impede duas relações follower->target repetidas
--    e é a mesma coluna usada nos "onConflict" do frontend.
ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_follower_target_unique;
ALTER TABLE public.follows ADD CONSTRAINT follows_follower_target_unique
  UNIQUE (follower_id, target_username);

-- 3. Colunas de contagem em profiles (idempotente).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;

-- 4. Recalcula os contadores a partir dos dados reais agora (corrige
--    qualquer contador que tenha ficado dessincronizado até aqui).
UPDATE public.profiles p SET
  followers_count = COALESCE((SELECT COUNT(*) FROM public.follows f WHERE f.target_username = p.username), 0),
  following_count = COALESCE((SELECT COUNT(*) FROM public.follows f WHERE f.follower_id = p.id
                                AND EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.username = f.target_username)), 0);

-- 5. Trigger que mantém os contadores sempre sincronizados com a BD,
--    para nunca mais depender de contagem feita só no frontend.
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

-- 6. RPC atómica: verifica a relação REAL na BD antes de decidir seguir
--    ou deixar de seguir — nunca duplica, nunca falha por já existir.
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

-- 7. Garante RLS ativa e política de leitura em "follows" — necessária
--    para o frontend conseguir ler o estado real de "já sigo".
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_all" ON public.follows;
CREATE POLICY "follows_select_all" ON public.follows
  FOR SELECT USING (true);

-- 8. Ativa Realtime na tabela follows e profiles — permite que seguir
--    num dispositivo reflita automaticamente noutros, sem recarregar.
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.follows; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

COMMIT;
