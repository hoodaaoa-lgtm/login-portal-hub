-- Hooda Studio: canais e vídeos, no MESMO projeto Supabase do Hooda
-- (reaproveita public.profiles e auth.users já existentes — não cria
-- nova tabela de profiles nem novo trigger handle_new_user).

-- Channels (um por utilizador, V1)
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT,
  country TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT handle_format CHECK (handle ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT name_len CHECK (char_length(name) BETWEEN 2 AND 60)
);
CREATE INDEX channels_handle_idx ON public.channels(lower(handle));
CREATE INDEX channels_owner_idx ON public.channels(owner_id);

GRANT SELECT ON public.channels TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels public read" ON public.channels FOR SELECT USING (true);
CREATE POLICY "owner insert channel" ON public.channels FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner update channel" ON public.channels FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "owner delete channel" ON public.channels FOR DELETE USING (auth.uid() = owner_id);

-- Videos
CREATE TYPE public.video_status AS ENUM ('processing','published','failed');
CREATE TYPE public.video_visibility AS ENUM ('public','private','unlisted');

CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_path TEXT,
  thumbnail_url TEXT,
  duration_seconds INT,
  status public.video_status NOT NULL DEFAULT 'processing',
  visibility public.video_visibility NOT NULL DEFAULT 'private',
  views_count BIGINT NOT NULL DEFAULT 0,
  likes_count BIGINT NOT NULL DEFAULT 0,
  comments_count BIGINT NOT NULL DEFAULT 0,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT title_len CHECK (char_length(title) BETWEEN 1 AND 120)
);
CREATE INDEX videos_channel_idx ON public.videos(channel_id, created_at DESC);
CREATE INDEX videos_public_idx ON public.videos(published_at DESC) WHERE visibility = 'public' AND status = 'published';

GRANT SELECT ON public.videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "videos public read" ON public.videos FOR SELECT
  USING (visibility = 'public' AND status = 'published' OR auth.uid() = owner_id);
CREATE POLICY "owner insert video" ON public.videos FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner update video" ON public.videos FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "owner delete video" ON public.videos FOR DELETE USING (auth.uid() = owner_id);

-- updated_at triggers (reaproveita a função touch_updated_at se já existir,
-- senão cria — usa CREATE OR REPLACE para ser seguro nos dois casos)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER channels_touch BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER videos_touch BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage: buckets do Studio (privados, acedidos por policy de dono)
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('channel-assets', 'channel-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: cada utilizador é dono de uma pasta nomeada com o seu uid
-- videos/{uid}/{video_id}.mp4
CREATE POLICY "videos owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "videos owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "videos owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "videos owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "thumbs owner all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "thumbs public read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'thumbnails');

CREATE POLICY "channel-assets owner all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'channel-assets' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'channel-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "channel-assets public read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'channel-assets');
