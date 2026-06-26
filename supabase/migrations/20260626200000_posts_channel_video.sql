-- Permite que um post seja publicado em nome de um canal
-- e associado a um vídeo da HoodaTV (partilha no feed)

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS channel_id   UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS video_id     UUID REFERENCES public.videos(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS video_thumb  TEXT;

CREATE INDEX IF NOT EXISTS posts_channel_idx ON public.posts(channel_id);
CREATE INDEX IF NOT EXISTS posts_video_idx   ON public.posts(video_id);

-- Política: dono do canal pode publicar em nome do canal
-- (author_id ainda é o utilizador, channel_id é o canal)
-- Nenhuma RLS extra necessária — usa as políticas existentes de posts
