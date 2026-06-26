-- ═══════════════════════════════════════════════════
-- Playlists + Video Likes (curtir) para feed
-- ═══════════════════════════════════════════════════

-- ── video_likes (curtir) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(video_id, user_id)
);
CREATE INDEX IF NOT EXISTS vl_video_idx ON public.video_likes(video_id);
CREATE INDEX IF NOT EXISTS vl_user_idx  ON public.video_likes(user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.video_likes TO authenticated;
GRANT SELECT ON public.video_likes TO anon;
GRANT ALL ON public.video_likes TO service_role;
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vl public read"  ON public.video_likes FOR SELECT USING (true);
CREATE POLICY "vl self insert"  ON public.video_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vl self delete"  ON public.video_likes FOR DELETE USING (auth.uid() = user_id);

-- trigger: actualiza likes_count na tabela videos
CREATE OR REPLACE FUNCTION public.sync_video_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET likes_count = likes_count + 1 WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS video_likes_sync ON public.video_likes;
CREATE TRIGGER video_likes_sync
  AFTER INSERT OR DELETE ON public.video_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_video_likes_count();

-- ── playlists ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.playlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT,
  cover_url   TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pl_user_idx ON public.playlists(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT SELECT ON public.playlists TO anon;
GRANT ALL ON public.playlists TO service_role;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pl public read"  ON public.playlists FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "pl self insert"  ON public.playlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pl self update"  ON public.playlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pl self delete"  ON public.playlists FOR DELETE USING (auth.uid() = user_id);

-- ── playlist_videos ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.playlist_videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  video_id    UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(playlist_id, video_id)
);
CREATE INDEX IF NOT EXISTS plv_playlist_idx ON public.playlist_videos(playlist_id, position);
CREATE INDEX IF NOT EXISTS plv_video_idx    ON public.playlist_videos(video_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_videos TO authenticated;
GRANT SELECT ON public.playlist_videos TO anon;
GRANT ALL ON public.playlist_videos TO service_role;
ALTER TABLE public.playlist_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plv read"   ON public.playlist_videos FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND (p.is_public OR p.user_id = auth.uid()))
);
CREATE POLICY "plv insert" ON public.playlist_videos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid())
);
CREATE POLICY "plv delete" ON public.playlist_videos FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid())
);

-- trigger updated_at playlists
DROP TRIGGER IF EXISTS playlists_touch ON public.playlists;
CREATE TRIGGER playlists_touch
  BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
