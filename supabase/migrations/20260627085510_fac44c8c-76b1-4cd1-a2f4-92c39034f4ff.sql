
-- 1. record_video_view: pin search_path, revoke PUBLIC, grant explicit
ALTER FUNCTION public.record_video_view(uuid, uuid, text, text, text) SET search_path TO 'public';
REVOKE EXECUTE ON FUNCTION public.record_video_view(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_video_view(uuid, uuid, text, text, text) TO anon, authenticated;

-- 2. channel_stats_view -> security_invoker
ALTER VIEW public.channel_stats_view SET (security_invoker = true);

-- 3. profiles: column-level grants so sensitive cols never leak
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, full_name, avatar_url, bio, created_at, updated_at,
  website, location, msg_permission, avatar_color, cover_url,
  is_online, last_seen, is_private, e2ee_public_key
) ON public.profiles TO authenticated;
GRANT SELECT (
  id, username, full_name, avatar_url, bio, created_at,
  website, location, avatar_color, cover_url, is_private
) ON public.profiles TO anon;

-- 4. community_messages: members/owner only, even for public communities
DROP POLICY IF EXISTS "cmsg read public or member" ON public.community_messages;
CREATE POLICY "cmsg read member" ON public.community_messages
  FOR SELECT TO authenticated
  USING (
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
  );

-- 5. community_bans: explicit SELECT policy for owners/admins/mods
DROP POLICY IF EXISTS "cb admin read" ON public.community_bans;
CREATE POLICY "cb admin read" ON public.community_bans
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_bans.community_id
        AND (
          c.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.community_members cm
            WHERE cm.community_id = c.id
              AND cm.user_id = auth.uid()
              AND cm.role = ANY (ARRAY['owner','admin','moderator'])
          )
        )
    )
  );

-- 6. library_books: hide file_data from clients; downloads via SECURITY DEFINER fn
REVOKE SELECT ON public.library_books FROM anon, authenticated;
GRANT SELECT (
  id, author_id, uploader_username, title, author_name, category,
  description, cover_url, cover_color, file_size, file_name,
  views_count, downloads_count, created_at
) ON public.library_books TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_library_book_file(p_book_id uuid)
RETURNS TABLE(file_data text, file_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  RETURN QUERY
    SELECT lb.file_data, lb.file_name
    FROM public.library_books lb
    WHERE lb.id = p_book_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_library_book_file(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_library_book_file(uuid) TO authenticated;

-- 7. video_views: kill always-true insert + hide viewer PII from channel owners
DROP POLICY IF EXISTS "vv anon insert" ON public.video_views;
DROP POLICY IF EXISTS "vv owner read" ON public.video_views;
REVOKE SELECT, INSERT ON public.video_views FROM anon, authenticated;
GRANT SELECT (
  id, video_id, channel_id, user_id, country, watch_pct, viewed_at, country_code
) ON public.video_views TO authenticated;
CREATE POLICY "vv owner read" ON public.video_views
  FOR SELECT TO authenticated
  USING (channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid()));

-- 8. storage messages-media: restrict SELECT to uploader or conversation participants
DROP POLICY IF EXISTS "messages-media auth read" ON storage.objects;
CREATE POLICY "messages-media participant read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'messages-media' AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.conversation_participants cp
          ON cp.conversation_id = m.conversation_id
        WHERE m.media_url LIKE '%' || storage.objects.name
          AND cp.user_id = auth.uid()
      )
    )
  );
