-- ═══════════════════════════════════════════════════════════
-- Fix: record_video_view nunca foi criada com sucesso
-- ═══════════════════════════════════════════════════════════
-- Causa 1: a migração 20260626210000_fix_views_and_follows.sql usava
--          "CREATE POLICY IF NOT EXISTS", que não é sintaxe válida em
--          PostgreSQL (CREATE POLICY não suporta IF NOT EXISTS). Isso
--          fazia a transação inteira da migração falhar (rollback),
--          incluindo a criação da função record_video_view.
-- Causa 2: mesmo que tivesse sido criada, a função tentava inserir na
--          coluna "viewer_id" da tabela video_views — essa coluna não
--          existe, a coluna real chama-se "user_id".
--
-- Esta migração recria tudo de forma idempotente e com sintaxe válida.

-- ── video_likes (idempotente, policies recriadas com DROP + CREATE) ────────
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

-- ── RPC: gravar view + incrementar contador (a função que o site chama) ───
CREATE OR REPLACE FUNCTION public.record_video_view(
  p_video_id   UUID,
  p_channel_id UUID DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.videos
    SET views_count = COALESCE(views_count, 0) + 1
    WHERE id = p_video_id;

  INSERT INTO public.video_views (video_id, channel_id, user_id, viewed_at)
  VALUES (
    p_video_id,
    COALESCE(p_channel_id, (SELECT channel_id FROM public.videos WHERE id = p_video_id)),
    auth.uid(),
    now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_video_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_video_view TO anon;

-- ── Realtime (idempotente, sem syntax error) ───────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'video_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_comments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'video_likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.video_likes;
  END IF;
END $$;
