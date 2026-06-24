-- 1) communities UPDATE: only owner or admin
DROP POLICY IF EXISTS "Members can update community" ON public.communities;
CREATE POLICY "Owner or admin can update community"
ON public.communities
FOR UPDATE
TO authenticated
USING (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = communities.id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
)
WITH CHECK (
  auth.uid() = owner_id
  OR EXISTS (
    SELECT 1 FROM public.community_members cm
    WHERE cm.community_id = communities.id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
);

-- 2) community_messages INSERT: require membership
DROP POLICY IF EXISTS "Authenticated can send messages" ON public.community_messages;
CREATE POLICY "Members can send messages"
ON public.community_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = community_messages.community_id
        AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_messages.community_id
        AND c.owner_id = auth.uid()
    )
  )
);

-- 3) library_books SELECT: authenticated only (file_data must not be public)
DROP POLICY IF EXISTS "Library books readable" ON public.library_books;
CREATE POLICY "Library books readable by authenticated"
ON public.library_books
FOR SELECT
TO authenticated
USING (true);

-- 4) profiles SELECT: drop anon access; authenticated only
DROP POLICY IF EXISTS "profiles_read_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_search" ON public.profiles;
REVOKE SELECT (phone_number) ON public.profiles FROM anon;
CREATE POLICY "profiles_read_authenticated"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 5) posts: scrub email addresses from author_name
UPDATE public.posts
SET author_name = COALESCE(NULLIF(author_username, ''), 'utilizador')
WHERE author_name LIKE '%@%';

-- 6) realtime.messages: require authentication to subscribe
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages;
CREATE POLICY "Authenticated can use realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);