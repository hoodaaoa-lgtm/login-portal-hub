CREATE TABLE IF NOT EXISTS public.channels (
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
CREATE INDEX IF NOT EXISTS channels_handle_idx ON public.channels(lower(handle));
CREATE INDEX IF NOT EXISTS channels_owner_idx ON public.channels(owner_id);
GRANT SELECT ON public.channels TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels public read" ON public.channels FOR SELECT USING (true);
CREATE POLICY "owner insert channel" ON public.channels FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner update channel" ON public.channels FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner delete channel" ON public.channels FOR DELETE TO authenticated USING (auth.uid() = owner_id);

DO $$ BEGIN
  CREATE TYPE public.video_status AS ENUM ('processing','published','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.video_visibility AS ENUM ('public','private','unlisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.videos (
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
CREATE INDEX IF NOT EXISTS videos_channel_idx ON public.videos(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS videos_public_idx ON public.videos(published_at DESC) WHERE visibility = 'public' AND status = 'published';
GRANT SELECT ON public.videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "videos public read" ON public.videos FOR SELECT USING ((visibility = 'public' AND status = 'published') OR auth.uid() = owner_id);
CREATE POLICY "owner insert video" ON public.videos FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner update video" ON public.videos FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner delete video" ON public.videos FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS channels_touch ON public.channels;
CREATE TRIGGER channels_touch BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS videos_touch ON public.videos;
CREATE TRIGGER videos_touch BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- studio storage policies
CREATE POLICY "videos owner read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "videos owner write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "videos owner update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "videos owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "thumbs owner all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "thumbs public read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'thumbnails');
CREATE POLICY "channel-assets owner all" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'channel-assets' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'channel-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "channel-assets public read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'channel-assets');

-- messages extras
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS view_once_opened_by TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS messages_conv_created ON public.messages (conversation_id, created_at);

CREATE OR REPLACE FUNCTION public.mark_view_once_opened(p_msg_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  UPDATE public.messages
    SET view_once_opened_by = array_append(view_once_opened_by, p_user_id::text)
    WHERE id = p_msg_id AND NOT (p_user_id::text = ANY(view_once_opened_by));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) TO authenticated;

-- reset messages policies to canonical
DROP POLICY IF EXISTS "msg read participants" ON public.messages;
DROP POLICY IF EXISTS "msg insert own" ON public.messages;
DROP POLICY IF EXISTS "msg insert own strict" ON public.messages;
DROP POLICY IF EXISTS "msg update" ON public.messages;
DROP POLICY IF EXISTS "msg update own" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;
DROP POLICY IF EXISTS "msg_select" ON public.messages;
DROP POLICY IF EXISTS "msg_insert" ON public.messages;
DROP POLICY IF EXISTS "msg_update" ON public.messages;
DROP POLICY IF EXISTS "msg_delete" ON public.messages;

CREATE POLICY "msg_select" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "msg_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "msg_update" ON public.messages FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "msg_delete" ON public.messages FOR DELETE TO authenticated USING (sender_id = auth.uid());
GRANT DELETE ON public.messages TO authenticated;

ALTER TABLE public.profiles ALTER COLUMN msg_permission SET DEFAULT 'todos';
UPDATE public.profiles SET msg_permission = 'todos' WHERE msg_permission = 'seguidores';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS read_receipts_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_last_seen boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.muted_conversations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  muted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.muted_conversations TO authenticated;
GRANT ALL ON public.muted_conversations TO service_role;
ALTER TABLE public.muted_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "muted_conv_own" ON public.muted_conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocked_own" ON public.blocked_users FOR ALL TO authenticated USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

-- messages-media storage policies
CREATE POLICY "messages-media public read" ON storage.objects FOR SELECT USING (bucket_id = 'messages-media');
CREATE POLICY "messages-media auth upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'messages-media');
CREATE POLICY "messages-media auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'messages-media');