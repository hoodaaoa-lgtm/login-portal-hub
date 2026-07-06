
-- 1) follows: drop the wide-open SELECT policy, keep the scoped one
DROP POLICY IF EXISTS "follows read" ON public.follows;

-- 2) community_key_shares: restrict UPDATE to caller's own row (sender or recipient)
DROP POLICY IF EXISTS "cks update member" ON public.community_key_shares;
CREATE POLICY "cks update own"
ON public.community_key_shares
FOR UPDATE
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = recipient_id)
WITH CHECK (auth.uid() = sender_id);

-- 3) conversation_key_shares: restrict UPDATE to the row owner
DROP POLICY IF EXISTS "participants update key shares" ON public.conversation_key_shares;
CREATE POLICY "users update own key shares"
ON public.conversation_key_shares
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND is_conversation_participant(conversation_id, auth.uid()));

-- 4) Lock down SECURITY DEFINER functions
-- Revoke default PUBLIC execute on all SECURITY DEFINER functions in public schema,
-- then grant back only to roles that must call them.

-- Trigger-only / internal-only functions: no client execute
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_admin_only_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drop_comment_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drop_interaction_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_drop_defaults() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_reposts_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_stories() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_drops() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_hooda_official_id() FROM PUBLIC, anon, authenticated;

-- RPC-callable functions: revoke anon, keep authenticated
REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_view_once_opened(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_conversation_with_participants(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.increment_post_replies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_post_replies(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.decrement_post_replies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_post_replies(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.increment_book_download(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_book_download(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.decrement_post_reposts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_post_reposts(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.increment_post_reposts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_post_reposts(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.increment_post_quotes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_post_quotes(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.increment_library_book_counter(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_library_book_counter(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_book_rating_average(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_book_rating_average(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_library_book_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_library_book_file(uuid) TO authenticated;

-- Functions used in RLS policies and for RPC — needed by both anon (public read paths) and authenticated
REVOKE ALL ON FUNCTION public.is_hooda_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_hooda_admin() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.is_community_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO anon, authenticated;

-- Functions callable via public/anon read paths (post/video view tracking) — keep anon
REVOKE ALL ON FUNCTION public.record_post_view(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_post_view(uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.record_video_view(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_video_view(uuid, uuid, text, text, text) TO anon, authenticated;
