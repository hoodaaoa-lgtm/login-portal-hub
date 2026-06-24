
-- 1. Fix library_books UPDATE policy: restrict to owner
DROP POLICY IF EXISTS "library_books update own or counters" ON public.library_books;
CREATE POLICY "library_books update own" ON public.library_books
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

-- Counter increments via SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.increment_library_book_counter(p_book_id uuid, p_counter text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_counter = 'downloads' THEN
    UPDATE public.library_books SET downloads_count = COALESCE(downloads_count,0)+1 WHERE id = p_book_id;
  ELSIF p_counter = 'views' THEN
    UPDATE public.library_books SET views_count = COALESCE(views_count,0)+1 WHERE id = p_book_id;
  ELSE
    RAISE EXCEPTION 'Counter inválido';
  END IF;
END;$$;
REVOKE EXECUTE ON FUNCTION public.increment_library_book_counter(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_library_book_counter(uuid, text) TO authenticated;

-- 2. community_bans: allow user to read own bans + block banned users from joining
CREATE POLICY "cb read own" ON public.community_bans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cm insert own" ON public.community_members;
CREATE POLICY "cm insert own not banned" ON public.community_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.community_bans b
      WHERE b.community_id = community_members.community_id AND b.user_id = auth.uid()
    )
  );

-- 3. community_mutes: allow user to read own mutes
CREATE POLICY "cmu read own" ON public.community_mutes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4. profiles: hide sensitive columns via view; restrict base table SELECT to owner
DROP POLICY IF EXISTS "profiles read auth" ON public.profiles;
CREATE POLICY "profiles read own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE VIEW public.profiles_public WITH (security_invoker=on) AS
  SELECT id, username, full_name, age, avatar_url, bio, created_at, updated_at,
         website, location, msg_permission, avatar_color, cover_url,
         is_online, last_seen, is_private, e2ee_public_key
  FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;

-- 5. messages-media storage: lock down SELECT/INSERT/DELETE
DROP POLICY IF EXISTS "messages-media public read" ON storage.objects;
DROP POLICY IF EXISTS "messages-media auth upload" ON storage.objects;
DROP POLICY IF EXISTS "messages-media auth delete" ON storage.objects;

CREATE POLICY "messages-media auth read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'messages-media');

CREATE POLICY "messages-media upload own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'messages-media'
    AND (auth.uid())::text = (storage.foldername(name))[2]
  );

CREATE POLICY "messages-media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'messages-media'
    AND (auth.uid())::text = (storage.foldername(name))[2]
  );

-- 6. Public buckets: remove broad listing policies (files still served via public CDN URL)
DROP POLICY IF EXISTS "channel-assets public read" ON storage.objects;
DROP POLICY IF EXISTS "thumbs public read" ON storage.objects;

-- 7. videos bucket: allow reading published public videos
CREATE POLICY "videos public published read" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM public.videos v
      WHERE v.video_path = name
        AND v.visibility = 'public'
        AND v.status = 'published'
    )
  );

-- 8. Function search_path + revoke EXECUTE from public/anon on SECURITY DEFINER funcs
CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.stories WHERE expires_at IS NOT NULL AND expires_at < now();
END;$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_stories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) TO authenticated;
