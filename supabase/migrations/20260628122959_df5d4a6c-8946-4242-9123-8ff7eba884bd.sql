
-- 1. notifications: replace always-true INSERT policy
DROP POLICY IF EXISTS "notif insert auth" ON public.notifications;
CREATE POLICY "notif insert self actor" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (actor_id IS NULL OR actor_id = auth.uid()));

-- 2. community_messages DELETE policy
DROP POLICY IF EXISTS "cmsg delete own or owner" ON public.community_messages;
CREATE POLICY "cmsg delete own or owner" ON public.community_messages
  FOR DELETE TO authenticated
  USING (
    auth.uid() = sender_id
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_messages.community_id AND c.owner_id = auth.uid())
  );

-- 3. video_views: drop viewer_ip column
ALTER TABLE public.video_views DROP COLUMN IF EXISTS viewer_ip;

-- 4. video_views INSERT policy (in addition to SECURITY DEFINER RPC)
DROP POLICY IF EXISTS "vv insert self" ON public.video_views;
CREATE POLICY "vv insert self" ON public.video_views
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- 5. Fix chat-media storage SELECT typo
DROP POLICY IF EXISTS "chat media read members" ON storage.objects;
CREATE POLICY "chat media read members" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.user_id = auth.uid()
          AND cm.community_id::text = (storage.foldername(objects.name))[2]
      )
      OR EXISTS (
        SELECT 1 FROM public.communities c
        WHERE c.owner_id = auth.uid()
          AND c.id::text = (storage.foldername(objects.name))[2]
      )
    )
  );

-- 6. Pin search_path on remaining function
ALTER FUNCTION public.update_reposts_count() SET search_path = public;

-- 7. Lock down EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_stories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reposts_count() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_profile_private() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_library_book_counter(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.increment_library_book_counter(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_library_book_file(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_library_book_file(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;

-- record_video_view / record_post_view: allow anon (anonymous view tracking via fingerprint)
REVOKE EXECUTE ON FUNCTION public.record_video_view(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_video_view(uuid, uuid, text, text, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_post_view(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_post_view(uuid, text) TO anon, authenticated;

-- 8. Reassert: revoke any lingering grants on sensitive profile columns
REVOKE SELECT (phone_number, last_seen, hide_last_seen, read_receipts_off, notification_prefs, is_private, e2ee_public_key)
  ON public.profiles FROM anon, authenticated, PUBLIC;
