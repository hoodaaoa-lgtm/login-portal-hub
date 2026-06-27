-- Adiciona coluna country à tabela video_views
ALTER TABLE public.video_views
  ADD COLUMN IF NOT EXISTS country     TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT;

-- Recria a função record_video_view com suporte a país
CREATE OR REPLACE FUNCTION public.record_video_view(
  p_video_id            UUID,
  p_channel_id          UUID DEFAULT NULL,
  p_viewer_fingerprint  TEXT DEFAULT NULL,
  p_country             TEXT DEFAULT NULL,
  p_country_code        TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_channel_id UUID;
  v_already    BOOLEAN := FALSE;
  v_cooldown   INTERVAL := INTERVAL '6 hours';
BEGIN
  SELECT COALESCE(p_channel_id, channel_id)
    INTO v_channel_id
    FROM public.videos
   WHERE id = p_video_id;

  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.video_views
       WHERE video_id = p_video_id
         AND user_id  = v_user_id
         AND viewed_at > now() - v_cooldown
    ) INTO v_already;
  ELSIF p_viewer_fingerprint IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.video_views
       WHERE video_id           = p_video_id
         AND viewer_fingerprint = p_viewer_fingerprint
         AND viewed_at          > now() - v_cooldown
    ) INTO v_already;
  END IF;

  IF v_already THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'cooldown');
  END IF;

  INSERT INTO public.video_views (video_id, channel_id, user_id, viewer_fingerprint, country, country_code, viewed_at)
  VALUES (p_video_id, v_channel_id, v_user_id, p_viewer_fingerprint, p_country, p_country_code, now())
  ON CONFLICT (video_id, user_id)
    DO UPDATE SET
      viewed_at    = now(),
      country      = COALESCE(EXCLUDED.country, video_views.country),
      country_code = COALESCE(EXCLUDED.country_code, video_views.country_code)
    WHERE video_views.viewed_at < now() - v_cooldown;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'conflict');
  END IF;

  UPDATE public.videos
     SET views_count = COALESCE(views_count, 0) + 1
   WHERE id = p_video_id;

  RETURN jsonb_build_object('counted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_video_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_video_view TO anon;
