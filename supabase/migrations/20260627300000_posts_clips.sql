-- Adiciona suporte a clipes de vídeo no feed
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS clip_video_id   UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clip_start      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clip_end        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clip_title      TEXT,
  ADD COLUMN IF NOT EXISTS channel_id      UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_handle  TEXT,
  ADD COLUMN IF NOT EXISTS channel_name    TEXT,
  ADD COLUMN IF NOT EXISTS channel_avatar  TEXT;

-- kind = 'clip' para estes posts
-- Índice para buscar clipes rapidamente
CREATE INDEX IF NOT EXISTS posts_clip_idx ON public.posts(clip_video_id) WHERE clip_video_id IS NOT NULL;
