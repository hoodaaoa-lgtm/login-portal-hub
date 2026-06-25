-- Adiciona campos do Cloudflare Stream à tabela videos
-- Os vídeos passam a ser armazenados e servidos pelo Cloudflare Stream
-- em vez do Supabase Storage.

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS cf_stream_uid  TEXT,
  ADD COLUMN IF NOT EXISTS cf_stream_url  TEXT,
  ADD COLUMN IF NOT EXISTS cf_embed_url   TEXT;

-- Índice para lookup rápido pelo UID do Stream
CREATE INDEX IF NOT EXISTS videos_cf_stream_uid_idx ON public.videos(cf_stream_uid)
  WHERE cf_stream_uid IS NOT NULL;

COMMENT ON COLUMN public.videos.cf_stream_uid IS 'UID único do vídeo no Cloudflare Stream';
COMMENT ON COLUMN public.videos.cf_stream_url IS 'URL HLS de reprodução (Cloudflare Stream)';
COMMENT ON COLUMN public.videos.cf_embed_url  IS 'URL do player iframe (Cloudflare Stream)';
