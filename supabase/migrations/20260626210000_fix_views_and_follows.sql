-- ── Corrigir: video_likes em falta ──────────────────────────────────────────
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
DROP POLICY IF EXISTS "vl public read" ON public.video_likes;
CREATE POLICY "vl public read" ON public.video_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "vl self insert" ON public.video_likes;
CREATE POLICY "vl self insert" ON public.video_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "vl self delete" ON public.video_likes;
CREATE POLICY "vl self delete" ON public.video_likes FOR DELETE USING (auth.uid() = user_id);

-- ── RPC: gravar view e incrementar contador ───────────────────────────────
CREATE OR REPLACE FUNCTION public.record_video_view(
  p_video_id   UUID,
  p_channel_id UUID DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Incrementar contador na tabela videos
  UPDATE public.videos
    SET views_count = COALESCE(views_count, 0) + 1
    WHERE id = p_video_id;

  -- Inserir registo em video_views para analytics do Studio
  INSERT INTO public.video_views (video_id, channel_id, viewer_id, viewed_at)
  VALUES (
    p_video_id,
    COALESCE(p_channel_id, (SELECT channel_id FROM public.videos WHERE id = p_video_id)),
    auth.uid(),
    now()
  )
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_video_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_video_view TO anon;

-- ── Realtime para comentários, likes, views ───────────────────────────────
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_comments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_likes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_follows;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
