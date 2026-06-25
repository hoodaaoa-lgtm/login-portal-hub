-- Hooda Studio & HoodaTV: Playlists
-- Depende de: channels, videos, auth.users (já existentes)

-- ── Tabela playlists ──────────────────────────────────────────────────────────
CREATE TABLE public.playlists (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID        NOT NULL REFERENCES public.channels(id)   ON DELETE CASCADE,
  owner_id        UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT,
  cover_video_id  UUID        REFERENCES public.videos(id)               ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT playlist_title_len CHECK (char_length(title) BETWEEN 2 AND 80)
);

CREATE INDEX playlists_channel_idx ON public.playlists(channel_id, created_at DESC);
CREATE INDEX playlists_owner_idx   ON public.playlists(owner_id);

GRANT SELECT ON public.playlists TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;
GRANT ALL ON public.playlists TO service_role;

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playlists public read"  ON public.playlists FOR SELECT USING (true);
CREATE POLICY "playlists owner insert" ON public.playlists FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "playlists owner update" ON public.playlists FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "playlists owner delete" ON public.playlists FOR DELETE USING (auth.uid() = owner_id);

CREATE TRIGGER playlists_touch
  BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Tabela playlist_videos ────────────────────────────────────────────────────
CREATE TABLE public.playlist_videos (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID    NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  video_id    UUID    NOT NULL REFERENCES public.videos(id)    ON DELETE CASCADE,
  position    INT     NOT NULL DEFAULT 0,
  UNIQUE (playlist_id, video_id)
);

CREATE INDEX playlist_videos_order_idx ON public.playlist_videos(playlist_id, position);

GRANT SELECT ON public.playlist_videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_videos TO authenticated;
GRANT ALL ON public.playlist_videos TO service_role;

ALTER TABLE public.playlist_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "playlist_videos public read"  ON public.playlist_videos FOR SELECT USING (true);
CREATE POLICY "playlist_videos owner write"  ON public.playlist_videos FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.owner_id = auth.uid())
  );
CREATE POLICY "playlist_videos owner update" ON public.playlist_videos FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.owner_id = auth.uid())
  );
CREATE POLICY "playlist_videos owner delete" ON public.playlist_videos FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.owner_id = auth.uid())
  );
