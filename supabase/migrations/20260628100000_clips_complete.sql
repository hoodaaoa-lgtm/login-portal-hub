-- ═══════════════════════════════════════════════════════════
-- CLIPES DE VÍDEO NO FEED — migração completa e definitiva
-- ═══════════════════════════════════════════════════════════

-- 1. Adicionar TODAS as colunas necessárias à tabela posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS clip_video_id   UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clip_start      NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clip_end        NUMERIC  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clip_title      TEXT,
  ADD COLUMN IF NOT EXISTS clip_thumb_url  TEXT,
  ADD COLUMN IF NOT EXISTS channel_id      UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_handle  TEXT,
  ADD COLUMN IF NOT EXISTS channel_name    TEXT,
  ADD COLUMN IF NOT EXISTS channel_avatar  TEXT,
  ADD COLUMN IF NOT EXISTS video_embed_url TEXT,
  ADD COLUMN IF NOT EXISTS video_stream_url TEXT;

-- 2. kind = 'clip' já existe como texto livre — sem enum para não partir

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS posts_clip_video_idx   ON public.posts(clip_video_id)  WHERE clip_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_kind_idx          ON public.posts(kind);
CREATE INDEX IF NOT EXISTS posts_channel_idx       ON public.posts(channel_id)     WHERE channel_id IS NOT NULL;

-- 4. RLS — clipes são posts normais, já cobertos pelas policies existentes
-- Apenas garantir que a policy de SELECT permite ver clipes públicos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'posts' AND policyname = 'posts_clips_public_read'
  ) THEN
    CREATE POLICY "posts_clips_public_read" ON public.posts
      FOR SELECT USING (true);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Função para buscar clipes com dados do canal e vídeo em join
CREATE OR REPLACE FUNCTION public.get_feed_clips(p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id              UUID,
  author_id       UUID,
  author_username TEXT,
  author_name     TEXT,
  author_color    TEXT,
  kind            TEXT,
  clip_video_id   UUID,
  clip_start      NUMERIC,
  clip_end        NUMERIC,
  clip_title      TEXT,
  clip_thumb_url  TEXT,
  channel_id      UUID,
  channel_handle  TEXT,
  channel_name    TEXT,
  channel_avatar  TEXT,
  video_embed_url TEXT,
  video_stream_url TEXT,
  likes_count     BIGINT,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    p.id,
    p.author_id,
    p.author_username,
    p.author_name,
    p.author_color,
    p.kind,
    p.clip_video_id,
    p.clip_start,
    p.clip_end,
    p.clip_title,
    COALESCE(p.clip_thumb_url, v.thumbnail_url) AS clip_thumb_url,
    p.channel_id,
    COALESCE(p.channel_handle, ch.handle)        AS channel_handle,
    COALESCE(p.channel_name,   ch.name)           AS channel_name,
    COALESCE(p.channel_avatar, ch.avatar_url)     AS channel_avatar,
    COALESCE(p.video_embed_url,  v.cf_embed_url)  AS video_embed_url,
    COALESCE(p.video_stream_url, v.cf_stream_url) AS video_stream_url,
    (SELECT COUNT(*) FROM public.post_likes pl WHERE pl.post_id = p.id) AS likes_count,
    p.created_at
  FROM public.posts p
  LEFT JOIN public.videos   v  ON v.id  = p.clip_video_id
  LEFT JOIN public.channels ch ON ch.id = p.channel_id
  WHERE p.kind = 'clip'
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_clips TO authenticated, anon;
