-- ============================================================================
-- Explorar — pesquisa global unificada
-- 1. search_history: guarda os termos pesquisados por cada utilizador, para
--    alimentar recomendação futura (nunca é lido por outros utilizadores).
-- 2. get_trending_hashtags: extrai #hashtags do conteúdo de posts recentes
--    e conta frequência — alimenta "Em tendência" e a pesquisa por hashtag,
--    que antes eram um array vazio hardcoded no frontend.
-- 3. Bump de user_interests (já usado pelo motor de ranking do feed, Fase 4)
--    a partir de likes, comentários e "guardados" — antes só o dwell time
--    (usePostImpression) alimentava isto; like/comentário/save são sinais
--    mais fortes de interesse e ficavam de fora.
-- ============================================================================

-- 1. Histórico de pesquisa ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.search_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_history_user_idx ON public.search_history(user_id, created_at DESC);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT, DELETE ON public.search_history TO authenticated;
GRANT ALL ON public.search_history TO service_role;

DROP POLICY IF EXISTS "search_history self read"   ON public.search_history;
DROP POLICY IF EXISTS "search_history self insert" ON public.search_history;
DROP POLICY IF EXISTS "search_history self delete" ON public.search_history;
CREATE POLICY "search_history self read"   ON public.search_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "search_history self insert" ON public.search_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "search_history self delete" ON public.search_history FOR DELETE USING (auth.uid() = user_id);

-- 2. Hashtags em tendência ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trending_hashtags(p_limit INTEGER DEFAULT 15)
RETURNS TABLE (tag TEXT, uses BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT lower(m[1]) AS tag, COUNT(*) AS uses
  FROM public.posts p,
       LATERAL regexp_matches(p.content, '#([[:alnum:]_]{2,40})', 'g') AS m
  WHERE p.is_draft = false
    AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
    AND p.created_at > now() - interval '14 days'
    AND p.content IS NOT NULL
  GROUP BY lower(m[1])
  ORDER BY uses DESC, tag ASC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_trending_hashtags(INTEGER) TO authenticated, anon;

-- 2b. Pesquisa de hashtags por termo (para a secção "Relacionado com sua
--     pesquisa" e a aba de hashtags na pesquisa global) ------------------
CREATE OR REPLACE FUNCTION public.search_hashtags(p_query TEXT, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (tag TEXT, uses BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT lower(m[1]) AS tag, COUNT(*) AS uses
  FROM public.posts p,
       LATERAL regexp_matches(p.content, '#([[:alnum:]_]{2,40})', 'g') AS m
  WHERE p.is_draft = false
    AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
    AND p.content IS NOT NULL
    AND m[1] ILIKE ('%' || p_query || '%')
  GROUP BY lower(m[1])
  ORDER BY uses DESC, tag ASC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.search_hashtags(TEXT, INTEGER) TO authenticated, anon;

-- 2c. Contagem de seguidores em lote (evita 1 pedido por cartão de pessoa
--     nas listas do Explorar) -----------------------------------------
CREATE OR REPLACE FUNCTION public.get_follower_counts(p_usernames TEXT[])
RETURNS TABLE (username TEXT, followers BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT target_username AS username, COUNT(*) AS followers
  FROM public.follows
  WHERE target_username = ANY(p_usernames)
  GROUP BY target_username;
$$;
GRANT EXECUTE ON FUNCTION public.get_follower_counts(TEXT[]) TO authenticated, anon;

-- 3. Bump de interesse a partir de likes ------------------------------------
CREATE OR REPLACE FUNCTION public.bump_interest(p_user_id UUID, p_author_id UUID, p_amount NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS NULL OR p_author_id IS NULL OR p_user_id = p_author_id THEN RETURN; END IF;
  INSERT INTO public.user_interests (user_id, author_id, score, interactions, updated_at)
  VALUES (p_user_id, p_author_id, p_amount, 1, now())
  ON CONFLICT (user_id, author_id) DO UPDATE
    SET score = public.user_interests.score + p_amount,
        interactions = public.user_interests.interactions + 1,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_post_like_interest()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
    PERFORM public.bump_interest(NEW.user_id, v_author, 3);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_post_like_interest ON public.post_likes;
CREATE TRIGGER trg_post_like_interest
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.handle_post_like_interest();

CREATE OR REPLACE FUNCTION public.handle_post_comment_interest()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
    PERFORM public.bump_interest(NEW.user_id, v_author, 5);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_post_comment_interest ON public.post_comments;
CREATE TRIGGER trg_post_comment_interest
AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_post_comment_interest();

CREATE OR REPLACE FUNCTION public.handle_post_save_interest()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
    PERFORM public.bump_interest(NEW.user_id, v_author, 6);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_post_save_interest ON public.post_saves;
CREATE TRIGGER trg_post_save_interest
AFTER INSERT ON public.post_saves
FOR EACH ROW EXECUTE FUNCTION public.handle_post_save_interest();

-- Mesmo tratamento para vídeos (like/comentário) --------------------------
CREATE OR REPLACE FUNCTION public.handle_video_like_interest()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT owner_id INTO v_author FROM public.videos WHERE id = NEW.video_id;
    PERFORM public.bump_interest(NEW.user_id, v_author, 3);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_video_like_interest ON public.video_likes;
CREATE TRIGGER trg_video_like_interest
AFTER INSERT ON public.video_likes
FOR EACH ROW EXECUTE FUNCTION public.handle_video_like_interest();

CREATE OR REPLACE FUNCTION public.handle_video_comment_interest()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT owner_id INTO v_author FROM public.videos WHERE id = NEW.video_id;
    PERFORM public.bump_interest(NEW.user_id, v_author, 5);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_video_comment_interest ON public.video_comments;
CREATE TRIGGER trg_video_comment_interest
AFTER INSERT ON public.video_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_video_comment_interest();
