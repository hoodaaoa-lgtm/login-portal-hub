-- ── video_likes (em falta na migration anterior) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(video_id, user_id)
);
CREATE INDEX IF NOT EXISTS vl_video_idx ON public.video_likes(video_id);
CREATE INDEX IF NOT EXISTS vl_user_idx  ON public.video_likes(user_id);
GRANT SELECT, INSERT, DELETE ON public.video_likes TO authenticated;
GRANT ALL ON public.video_likes TO service_role;
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vl public read"  ON public.video_likes FOR SELECT USING (true);
CREATE POLICY "vl self insert"  ON public.video_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vl self delete"  ON public.video_likes FOR DELETE USING (auth.uid() = user_id);

-- ── Função RPC para incrementar views de forma segura (sem race condition) ──
CREATE OR REPLACE FUNCTION public.increment_video_views(p_video_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.videos
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_video_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_video_views TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_video_views TO anon;

-- ── Função RPC para stats do canal (para o Studio) ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_channel_stats(p_channel_id UUID)
RETURNS TABLE(
  total_videos   bigint,
  published      bigint,
  total_views    bigint,
  total_likes    bigint,
  total_comments bigint,
  subscribers    bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(v.id)                                              AS total_videos,
    COUNT(v.id) FILTER (WHERE v.status = 'published')       AS published,
    COALESCE(SUM(v.views_count), 0)                         AS total_views,
    (SELECT COUNT(*) FROM public.video_likes vl
     JOIN public.videos v2 ON vl.video_id = v2.id
     WHERE v2.channel_id = p_channel_id)                    AS total_likes,
    (SELECT COUNT(*) FROM public.video_comments vc
     JOIN public.videos v3 ON vc.video_id = v3.id
     WHERE v3.channel_id = p_channel_id)                    AS total_comments,
    (SELECT COUNT(*) FROM public.channel_subscribers cs
     WHERE cs.channel_id = p_channel_id)                    AS subscribers
  FROM public.videos v
  WHERE v.channel_id = p_channel_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_channel_stats TO authenticated;

-- ── channel_subscribers (para subs reais no Studio) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.channel_subscribers (
  channel_id   UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS cs_channel_idx ON public.channel_subscribers(channel_id);
CREATE INDEX IF NOT EXISTS cs_user_idx    ON public.channel_subscribers(user_id);
GRANT SELECT, INSERT, DELETE ON public.channel_subscribers TO authenticated;
GRANT ALL ON public.channel_subscribers TO service_role;
ALTER TABLE public.channel_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs public read"  ON public.channel_subscribers FOR SELECT USING (true);
CREATE POLICY "cs self insert"  ON public.channel_subscribers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cs self delete"  ON public.channel_subscribers FOR DELETE USING (auth.uid() = user_id);

-- ── Realtime para comentários e likes ────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_subscribers;
