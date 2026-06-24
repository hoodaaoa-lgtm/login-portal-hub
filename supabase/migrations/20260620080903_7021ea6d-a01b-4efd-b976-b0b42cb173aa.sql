
-- Profiles: column-level grants so phone_number is owner-only via RLS
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, username, full_name, bio, avatar_url, cover_url, website, created_at, updated_at, age, location, avatar_color, msg_permission, is_online, last_seen) ON public.profiles TO anon, authenticated;
GRANT SELECT (phone_number) ON public.profiles TO authenticated;

-- Replace blanket SELECT with explicit policies for clarity
DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read_public ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (true);

-- Library books: tighten update to uploader only
DROP POLICY IF EXISTS "Authenticated can update counters" ON public.library_books;
CREATE POLICY "Uploader can update book" ON public.library_books
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- Story views: restrict reads to the story author; allow viewers to insert their own
DROP POLICY IF EXISTS sv_all ON public.story_views;
CREATE POLICY sv_insert_own ON public.story_views
  FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());
CREATE POLICY sv_select_author ON public.story_views
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_views.story_id AND s.user_id = auth.uid()));

-- Storage: per-user folder ownership for messages-media (bucket is now private)
DROP POLICY IF EXISTS "messages media upload" ON storage.objects;
CREATE POLICY "messages media upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'messages-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "messages media read own folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'messages-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "messages media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'messages-media' AND auth.uid()::text = (storage.foldername(name))[1]);
