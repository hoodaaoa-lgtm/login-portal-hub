ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS emoji text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS music_url text,
  ADD COLUMN IF NOT EXISTS music_title text,
  ADD COLUMN IF NOT EXISTS music_artist text,
  ADD COLUMN IF NOT EXISTS music_cover text,
  ADD COLUMN IF NOT EXISTS photos text[],
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS shared_from_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_color text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen timestamptz,
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"likes":true,"comments":true,"follows":true,"messages":true,"mentions":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS e2ee_public_key text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_msg_permission_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_msg_permission_check CHECK (msg_permission IN ('todos', 'seguidores', 'mutuos', 'aprovados'));

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS post_comments_parent_idx ON public.post_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS post_comments_user_idx ON public.post_comments(user_id);

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS filter_css text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS bg_grad text,
  ADD COLUMN IF NOT EXISTS text text;

CREATE TABLE IF NOT EXISTS public.post_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_comment_likes TO authenticated;
GRANT ALL ON public.post_comment_likes TO service_role;
ALTER TABLE public.post_comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comment likes read" ON public.post_comment_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "comment likes insert own" ON public.post_comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comment likes delete own" ON public.post_comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.post_hidden (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_hidden TO authenticated;
GRANT ALL ON public.post_hidden TO service_role;
ALTER TABLE public.post_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post hidden read own" ON public.post_hidden FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "post hidden insert own" ON public.post_hidden FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post hidden delete own" ON public.post_hidden FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preview_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);
GRANT SELECT, INSERT, UPDATE ON public.message_requests TO authenticated;
GRANT ALL ON public.message_requests TO service_role;
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mr select own" ON public.message_requests FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "mr insert own" ON public.message_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "mr update receiver" ON public.message_requests FOR UPDATE TO authenticated USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE INDEX IF NOT EXISTS idx_message_requests_receiver ON public.message_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_message_requests_sender ON public.message_requests(sender_id);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'sticker', 'video', 'file')),
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS duration integer,
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS view_once boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_for_all boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receiver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_conversation_with_participants(p_my_id uuid, p_other_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF auth.uid() != p_my_id THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  SELECT cp1.conversation_id INTO v_conv_id FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = p_my_id AND cp2.user_id = p_other_id LIMIT 1;
  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;
  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_conv_id, p_my_id), (v_conv_id, p_other_id);
  RETURN v_conv_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.community_key_shares (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_public_key text NOT NULL,
  encrypted_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_cks_recipient ON public.community_key_shares(recipient_id);
CREATE INDEX IF NOT EXISTS idx_cks_community ON public.community_key_shares(community_id);
GRANT SELECT, INSERT, UPDATE ON public.community_key_shares TO authenticated;
GRANT ALL ON public.community_key_shares TO service_role;
ALTER TABLE public.community_key_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cks select own" ON public.community_key_shares FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "cks insert member" ON public.community_key_shares FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id = community_key_shares.community_id AND user_id = auth.uid())
);
CREATE POLICY "cks update member" ON public.community_key_shares FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_members WHERE community_id = community_key_shares.community_id AND user_id = auth.uid()))
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id = community_key_shares.community_id AND user_id = auth.uid()));

ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS user_color text,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid,
  ADD COLUMN IF NOT EXISTS reply_to_preview text,
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_cmsg_encrypted ON public.community_messages(community_id, is_encrypted);