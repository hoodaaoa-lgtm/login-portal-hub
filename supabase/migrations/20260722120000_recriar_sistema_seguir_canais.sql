-- ───────────────────────────────────────────────────────────────────────
-- Recria o sistema de "seguir" (Acompanhar) para canais, do zero.
-- A tabela public.follows deixou de existir na base de dados em algum
-- momento (provavelmente durante a consolidação do schema), mas a função
-- get_personalized_feed_v3 continuava a referenciá-la — o que causava o
-- erro "relation public.follows does not exist" e quebrava o feed
-- inteiro (42P01).
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS follows_follower_id_idx  ON public.follows(follower_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows_select_all" ON public.follows;
CREATE POLICY "follows_select_all" ON public.follows FOR SELECT USING (true);
DROP POLICY IF EXISTS "follows insert own" ON public.follows;
CREATE POLICY "follows insert own" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
DROP POLICY IF EXISTS "follows delete own" ON public.follows;
CREATE POLICY "follows delete own" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

GRANT SELECT ON public.follows TO anon;
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Garante followers_count/following_count corretos em profiles ─────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;

-- Zera e recalcula a partir do zero (tabela follows acabou de ser criada vazia)
UPDATE public.profiles SET followers_count = 0, following_count = 0;

-- ── Trigger: mantém os contadores sincronizados a cada seguir/deixar ──
CREATE OR REPLACE FUNCTION public.sync_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_id;
    UPDATE public.profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_change ON public.follows;
CREATE TRIGGER trg_follow_change
AFTER INSERT OR DELETE ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.sync_follow_counts();

-- ── RPC: liga/desliga seguir um canal (perfil) ─────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_follow(p_following_id uuid)
RETURNS TABLE (following boolean, followers_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'É necessário sessão iniciada.';
  END IF;
  IF v_uid = p_following_id THEN
    RAISE EXCEPTION 'Não podes seguir o teu próprio canal.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_id = v_uid AND following_id = p_following_id) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.follows WHERE follower_id = v_uid AND following_id = p_following_id;
  ELSE
    INSERT INTO public.follows (follower_id, following_id) VALUES (v_uid, p_following_id);
  END IF;

  RETURN QUERY
  SELECT NOT v_exists, p.followers_count FROM public.profiles p WHERE p.id = p_following_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_follow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_follow(uuid) TO authenticated;
