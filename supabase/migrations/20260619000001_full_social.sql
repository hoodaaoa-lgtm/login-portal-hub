-- =====================================================
-- FULL SOCIAL NETWORK MIGRATION
-- =====================================================

-- 1. Add following_id to follows (UUID-based)
ALTER TABLE public.follows ADD COLUMN IF NOT EXISTS following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS follows_follower_id_idx ON public.follows(follower_id);
-- Populate following_id from existing target_username data
UPDATE public.follows f SET following_id = p.id FROM public.profiles p WHERE p.username = f.target_username AND f.following_id IS NULL;

-- 2. Add msg_permission to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS msg_permission text NOT NULL DEFAULT 'seguidores' CHECK (msg_permission IN ('todos', 'seguidores', 'mutuos'));

-- 3. communities
CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  description text,
  category text DEFAULT 'Geral',
  privacy text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'private')),
  cover_color text DEFAULT '#5B3FCF',
  emoji text DEFAULT '🌐',
  photo_url text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  allow_search boolean NOT NULL DEFAULT true,
  member_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "communities read public or member" ON public.communities FOR SELECT TO authenticated USING (
  privacy = 'public' OR owner_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.community_members WHERE community_id = communities.id AND user_id = auth.uid())
);
CREATE POLICY "communities insert own" ON public.communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "communities update own" ON public.communities FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "communities delete own" ON public.communities FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- 4. community_members
CREATE TABLE IF NOT EXISTS public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm read all" ON public.community_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "cm insert own" ON public.community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cm delete own" ON public.community_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. community_messages
CREATE TABLE IF NOT EXISTS public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_username text NOT NULL,
  sender_color text DEFAULT '#5B3FCF',
  content text NOT NULL,
  reply_to uuid REFERENCES public.community_messages(id) ON DELETE SET NULL,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_messages TO authenticated;
GRANT ALL ON public.community_messages TO service_role;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmsg read public or member" ON public.community_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_messages.community_id AND (c.privacy = 'public' OR c.owner_id = auth.uid()))
  OR EXISTS (SELECT 1 FROM public.community_members WHERE community_id = community_messages.community_id AND user_id = auth.uid())
);
CREATE POLICY "cmsg insert member" ON public.community_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND (
    EXISTS (SELECT 1 FROM public.community_members WHERE community_id = community_messages.community_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.communities WHERE id = community_messages.community_id AND owner_id = auth.uid())
  )
);
CREATE POLICY "cmsg update own" ON public.community_messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id);

-- 6. conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv read participants" ON public.conversations FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = conversations.id AND user_id = auth.uid())
);
CREATE POLICY "conv insert" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);

-- 7. conversation_participants
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp read own" ON public.conversation_participants FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.conversation_participants cp2 WHERE cp2.conversation_id = conversation_participants.conversation_id AND cp2.user_id = auth.uid())
);
CREATE POLICY "cp insert" ON public.conversation_participants FOR INSERT TO authenticated WITH CHECK (true);

-- 8. messages (private)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg read participants" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "msg insert own" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "msg update" ON public.messages FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);

-- 9. friend_requests
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);
GRANT SELECT, INSERT, UPDATE ON public.friend_requests TO authenticated;
GRANT ALL ON public.friend_requests TO service_role;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr read own" ON public.friend_requests FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "fr insert own" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "fr update" ON public.friend_requests FOR UPDATE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 10. stories_books
CREATE TABLE IF NOT EXISTS public.stories_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_username text NOT NULL DEFAULT '',
  title text NOT NULL,
  cover_color text DEFAULT '#5B3FCF',
  cover_url text,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  chapter_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories_books TO authenticated;
GRANT ALL ON public.stories_books TO service_role;
ALTER TABLE public.stories_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "books read published or own" ON public.stories_books FOR SELECT TO authenticated USING (status = 'published' OR auth.uid() = author_id);
CREATE POLICY "books insert own" ON public.stories_books FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "books update own" ON public.stories_books FOR UPDATE TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "books delete own" ON public.stories_books FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- 11. story_chapters
CREATE TABLE IF NOT EXISTS public.story_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.stories_books(id) ON DELETE CASCADE,
  chapter_number integer NOT NULL DEFAULT 1,
  title text DEFAULT '',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, chapter_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_chapters TO authenticated;
GRANT ALL ON public.story_chapters TO service_role;
ALTER TABLE public.story_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chapters read via book" ON public.story_chapters FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.stories_books WHERE id = story_chapters.book_id AND (status = 'published' OR auth.uid() = author_id))
);
CREATE POLICY "chapters insert own" ON public.story_chapters FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.stories_books WHERE id = story_chapters.book_id AND auth.uid() = author_id)
);
CREATE POLICY "chapters update own" ON public.story_chapters FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.stories_books WHERE id = story_chapters.book_id AND auth.uid() = author_id)
);
CREATE POLICY "chapters delete own" ON public.story_chapters FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.stories_books WHERE id = story_chapters.book_id AND auth.uid() = author_id)
);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
