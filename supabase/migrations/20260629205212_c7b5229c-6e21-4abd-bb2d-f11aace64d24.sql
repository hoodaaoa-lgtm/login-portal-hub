
-- 1. library_books: restrict SELECT to author
DROP POLICY IF EXISTS "library_books read all" ON public.library_books;
CREATE POLICY "library_books read own" ON public.library_books
  FOR SELECT TO authenticated
  USING (auth.uid() = author_id);

-- 2. notifications: tighten INSERT - actor must be caller, recipient must differ
DROP POLICY IF EXISTS "notif insert self actor" ON public.notifications;
CREATE POLICY "notif insert self actor" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND actor_id = auth.uid()
    AND user_id IS NOT NULL
    AND user_id <> auth.uid()
  );

-- 3. profiles: re-assert column revokes (defence in depth)
REVOKE SELECT (phone_number, notification_prefs, read_receipts_off, hide_last_seen)
  ON public.profiles FROM anon, authenticated, PUBLIC;

-- 4. video_views: add anon insert (fingerprint-only) and tighten always-true policies elsewhere
DROP POLICY IF EXISTS "vv insert anon" ON public.video_views;
CREATE POLICY "vv insert anon" ON public.video_views
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND viewer_fingerprint IS NOT NULL);

-- 5. Always-true INSERT policies
DROP POLICY IF EXISTS post_views_insert ON public.post_views;
CREATE POLICY post_views_insert ON public.post_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (viewer_fingerprint IS NOT NULL);

DROP POLICY IF EXISTS "bd insert" ON public.book_downloads;
CREATE POLICY "bd insert" ON public.book_downloads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));

-- 6. Function search_path on the two missing ones
ALTER FUNCTION public.update_book_rating_average(uuid) SET search_path = public;
ALTER FUNCTION public.increment_book_download(uuid) SET search_path = public;

-- 7. Revoke EXECUTE from PUBLIC / anon / authenticated on SECURITY DEFINER functions
--    that should never be callable directly from the client. Keep only intentional grants.
REVOKE EXECUTE ON FUNCTION public.update_book_rating_average(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_book_download(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_stories()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reposts_count()           FROM PUBLIC, anon, authenticated;

-- Functions intentionally callable by authenticated users (auth checks done inside):
-- get_my_profile_private, mark_view_once_opened, is_conversation_participant,
-- create_conversation_with_participants, increment_library_book_counter,
-- get_library_book_file remain granted to authenticated.

-- record_video_view and record_post_view are intentionally callable anonymously
-- to support fingerprint-based view tracking.
