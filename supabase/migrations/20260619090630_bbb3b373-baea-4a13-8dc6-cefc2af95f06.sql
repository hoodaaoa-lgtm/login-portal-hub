
-- POSTS
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_username text,
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS author_color text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS emoji text,
  ADD COLUMN IF NOT EXISTS is_ad boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS music_url text,
  ADD COLUMN IF NOT EXISTS music_title text,
  ADD COLUMN IF NOT EXISTS music_artist text,
  ADD COLUMN IF NOT EXISTS music_cover text;

-- PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age int,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS avatar_color text;

-- FOLLOWS: drop composite PK so following_id can be nullable, add surrogate id + target_username
DO $$
DECLARE pkname text;
BEGIN
  SELECT conname INTO pkname FROM pg_constraint
   WHERE conrelid = 'public.follows'::regclass AND contype = 'p';
  IF pkname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.follows DROP CONSTRAINT %I', pkname);
  END IF;
END$$;

ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS target_username text,
  ALTER COLUMN following_id DROP NOT NULL;

UPDATE public.follows SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.follows ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.follows ADD PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS follows_target_username_idx ON public.follows(target_username);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows(follower_id);

-- POST_COMMENTS
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS author_username text,
  ADD COLUMN IF NOT EXISTS author_color text,
  ALTER COLUMN author_id DROP NOT NULL;
UPDATE public.post_comments SET user_id = author_id WHERE user_id IS NULL AND author_id IS NOT NULL;

-- STORIES
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS filter_css text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS bg_grad text,
  ADD COLUMN IF NOT EXISTS text text,
  ADD COLUMN IF NOT EXISTS author_color text,
  ADD COLUMN IF NOT EXISTS author_username text,
  ADD COLUMN IF NOT EXISTS story_data jsonb;

-- COMMUNITIES
CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  cover_color text DEFAULT '#5B3FCF',
  emoji text DEFAULT '🌐',
  photo_url text,
  owner_id uuid NOT NULL,
  allow_search boolean NOT NULL DEFAULT true,
  privacy text NOT NULL DEFAULT 'public',
  member_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT SELECT ON public.communities TO anon;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Communities are readable" ON public.communities;
DROP POLICY IF EXISTS "Authenticated can create communities" ON public.communities;
DROP POLICY IF EXISTS "Owner can update community" ON public.communities;
DROP POLICY IF EXISTS "Members can update member_count" ON public.communities;
DROP POLICY IF EXISTS "Owner can delete community" ON public.communities;
CREATE POLICY "Communities are readable" ON public.communities FOR SELECT USING (true);
CREATE POLICY "Authenticated can create communities" ON public.communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Authenticated can update community" ON public.communities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Owner can delete community" ON public.communities FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- COMMUNITY_MEMBERS
CREATE TABLE IF NOT EXISTS public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT SELECT ON public.community_members TO anon;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members readable" ON public.community_members;
DROP POLICY IF EXISTS "Users can join" ON public.community_members;
DROP POLICY IF EXISTS "Users can leave" ON public.community_members;
CREATE POLICY "Members readable" ON public.community_members FOR SELECT USING (true);
CREATE POLICY "Users can join" ON public.community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave" ON public.community_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- COMMUNITY_MESSAGES
CREATE TABLE IF NOT EXISTS public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  username text,
  user_color text,
  content text,
  reply_to_id uuid,
  reply_to_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_messages TO authenticated;
GRANT SELECT ON public.community_messages TO anon;
GRANT ALL ON public.community_messages TO service_role;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Community messages readable" ON public.community_messages;
DROP POLICY IF EXISTS "Authenticated can send messages" ON public.community_messages;
DROP POLICY IF EXISTS "Author can delete own message" ON public.community_messages;
CREATE POLICY "Community messages readable" ON public.community_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated can send messages" ON public.community_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Author can delete own message" ON public.community_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- LIBRARY_BOOKS
CREATE TABLE IF NOT EXISTS public.library_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  uploader_username text NOT NULL DEFAULT '',
  title text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Geral',
  description text NOT NULL DEFAULT '',
  cover_url text,
  cover_color text NOT NULL DEFAULT '#5B3FCF',
  file_data text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  file_name text NOT NULL DEFAULT '',
  views_count integer NOT NULL DEFAULT 0,
  downloads_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT SELECT ON public.library_books TO anon;
GRANT ALL ON public.library_books TO service_role;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Library books readable" ON public.library_books;
DROP POLICY IF EXISTS "Authenticated can upload books" ON public.library_books;
DROP POLICY IF EXISTS "Anyone can update counters" ON public.library_books;
DROP POLICY IF EXISTS "Uploader can delete book" ON public.library_books;
CREATE POLICY "Library books readable" ON public.library_books FOR SELECT USING (true);
CREATE POLICY "Authenticated can upload books" ON public.library_books FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Anyone can update counters" ON public.library_books FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Uploader can delete book" ON public.library_books FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- REALTIME
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['posts','post_likes','post_comments','post_saves','stories','messages','follows','communities','community_members','community_messages','library_books','profiles']) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END$$;
