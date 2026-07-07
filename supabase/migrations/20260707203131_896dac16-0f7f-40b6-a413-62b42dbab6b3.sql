
-- 1) Fix mutable search_path on get_personalized_feed
ALTER FUNCTION public.get_personalized_feed(uuid, timestamptz, integer) SET search_path = public;

-- 2) Books: restrict file_url column and provide controlled RPC
REVOKE SELECT (file_url) ON public.books FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.get_book_file_url(p_book_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT file_url INTO v_url FROM public.books WHERE id = p_book_id;
  IF v_url IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.books
     SET downloads = COALESCE(downloads, 0) + 1
   WHERE id = p_book_id;

  INSERT INTO public.book_downloads (user_id, book_id)
  VALUES (auth.uid(), p_book_id)
  ON CONFLICT DO NOTHING;

  RETURN v_url;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_book_file_url(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_book_file_url(uuid) TO authenticated;

-- 3) post_views: restrict SELECT (no more public read of fingerprints)
DROP POLICY IF EXISTS post_views_read ON public.post_views;

CREATE POLICY post_views_read_self ON public.post_views
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_views.post_id AND p.author_id = auth.uid())
);

-- 4) Lock down internal / trigger / admin SECURITY DEFINER functions
DO $$
DECLARE
  fn record;
  internal_names text[] := ARRAY[
    'handle_post_like_change','handle_video_like_change',
    'handle_post_comment_change','handle_video_comment_change',
    'handle_follow_change','handle_new_user',
    'touch_updated_at','enforce_community_message_encryption',
    'flag_spam_before_insert','drop_comment_count','drop_interaction_count',
    'set_drop_defaults','trg_recompute_quality_on_counts_change',
    'trg_init_quality_on_insert','update_reposts_count',
    'protect_admin_only_profile_fields',
    'admin_delete_account','apply_content_moderation',
    'recompute_content_quality','set_post_technical_quality',
    'decay_interest_scores','cleanup_expired_stories','cleanup_expired_drops',
    'get_hooda_official_id'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY(internal_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;',
                   fn.proname, fn.args);
  END LOOP;
END $$;
