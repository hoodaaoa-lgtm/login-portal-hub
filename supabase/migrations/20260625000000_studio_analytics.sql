-- ═══════════════════════════════════════════════════════════
-- Hooda Studio — Analytics completo
-- Tabelas: channel_follows, video_views, video_likes
-- View: channel_stats_view
-- ═══════════════════════════════════════════════════════════

-- ── channel_follows ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.channel_follows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS cf_channel_idx ON public.channel_follows(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cf_user_idx    ON public.channel_follows(user_id);

GRANT SELECT, INSERT, DELETE ON public.channel_follows TO authenticated;
GRANT SELECT ON public.channel_follows TO anon;
GRANT ALL    ON public.channel_follows TO service_role;

ALTER TABLE public.channel_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cf public read"   ON public.channel_follows FOR SELECT USING (true);
CREATE POLICY "cf self insert"   ON public.channel_follows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cf self delete"   ON public.channel_follows FOR DELETE USING (auth.uid() = user_id);

-- ── video_views ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  channel_id  UUID NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  country     TEXT,           -- ISO-3166-1 alpha-2, ex: 'AO', 'PT'
  viewer_ip   TEXT,           -- hashed, para dedup de anónimos
  watch_pct   SMALLINT DEFAULT 0 CHECK (watch_pct BETWEEN 0 AND 100),
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vv_video_idx    ON public.video_views(video_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS vv_channel_idx  ON public.video_views(channel_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS vv_country_idx  ON public.video_views(channel_id, country);

GRANT SELECT, INSERT ON public.video_views TO authenticated;
GRANT INSERT         ON public.video_views TO anon;
GRANT ALL            ON public.video_views TO service_role;

ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vv owner read"  ON public.video_views FOR SELECT
  USING (channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid()));
CREATE POLICY "vv anon insert" ON public.video_views FOR INSERT WITH CHECK (true);

-- ── video_likes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(video_id, user_id)
);
CREATE INDEX IF NOT EXISTS vl_video_idx ON public.video_likes(video_id);

GRANT SELECT, INSERT, DELETE ON public.video_likes TO authenticated;
GRANT ALL    ON public.video_likes TO service_role;

ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vl public read"  ON public.video_likes FOR SELECT USING (true);
CREATE POLICY "vl self insert"  ON public.video_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vl self delete"  ON public.video_likes FOR DELETE USING (auth.uid() = user_id);

-- ── channel_stats_view ─────────────────────────────────────
CREATE OR REPLACE VIEW public.channel_stats_view AS
SELECT
  c.id AS channel_id,
  COUNT(DISTINCT v.id)                                                         AS total_videos,
  COUNT(DISTINCT v.id) FILTER (WHERE v.visibility = 'public'
                                 AND v.status = 'published')                   AS published_videos,
  COALESCE(SUM(v.views_count), 0)                                              AS total_views,
  COALESCE(SUM(v.duration_seconds), 0)                                         AS total_duration_seconds,
  COUNT(DISTINCT cf.user_id)                                                   AS followers,
  COUNT(DISTINCT vv.id) FILTER (WHERE vv.viewed_at >= now() - INTERVAL '24h') AS views_24h,
  COUNT(DISTINCT vv.id) FILTER (WHERE vv.viewed_at >= now() - INTERVAL '7d')  AS views_7d,
  COUNT(DISTINCT vv.id) FILTER (WHERE vv.viewed_at >= now() - INTERVAL '28d') AS views_28d,
  ROUND(AVG(vv.watch_pct))                                                     AS avg_watch_pct,
  COUNT(DISTINCT cf2.user_id) FILTER (WHERE cf2.created_at >= now() - INTERVAL '28d') AS followers_gained_28d
FROM public.channels c
LEFT JOIN public.videos v          ON v.channel_id = c.id
LEFT JOIN public.channel_follows cf ON cf.channel_id = c.id
LEFT JOIN public.video_views vv    ON vv.channel_id = c.id
LEFT JOIN public.channel_follows cf2 ON cf2.channel_id = c.id
GROUP BY c.id;

GRANT SELECT ON public.channel_stats_view TO authenticated;

-- ── Realtime ───────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.videos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_follows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_views;
