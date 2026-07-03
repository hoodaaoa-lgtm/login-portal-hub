-- ── Analytics de publicações (views, likes, comments, compartilhamentos) ──
CREATE TABLE IF NOT EXISTS public.post_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  channel_id      UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  views_count     INTEGER NOT NULL DEFAULT 0,
  likes_count     INTEGER NOT NULL DEFAULT 0,
  comments_count  INTEGER NOT NULL DEFAULT 0,
  shares_count    INTEGER NOT NULL DEFAULT 0,
  click_through   INTEGER NOT NULL DEFAULT 0,
  avg_watch_time  INTEGER DEFAULT 0, -- em segundos
  device_type     TEXT[], -- ['mobile', 'desktop', 'tablet']
  country         TEXT[], -- países onde foi visto
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pa_post_idx ON public.post_analytics(post_id);
CREATE INDEX IF NOT EXISTS pa_channel_idx ON public.post_analytics(channel_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.post_analytics TO authenticated;
GRANT ALL ON public.post_analytics TO service_role;
ALTER TABLE public.post_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa read own" ON public.post_analytics FOR SELECT USING (
  channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid())
);

-- ── Sistema de ganhos/Monetização ──
CREATE TABLE IF NOT EXISTS public.creator_earnings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  month           DATE NOT NULL,
  views           INTEGER NOT NULL DEFAULT 0,
  ad_revenue      DECIMAL(10,2) NOT NULL DEFAULT 0,
  bonus_revenue   DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_earned    DECIMAL(10,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending, paid
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, month)
);
CREATE INDEX IF NOT EXISTS ce_channel_idx ON public.creator_earnings(channel_id);
GRANT SELECT, INSERT, UPDATE ON public.creator_earnings TO authenticated;
GRANT ALL ON public.creator_earnings TO service_role;
ALTER TABLE public.creator_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ce read own" ON public.creator_earnings FOR SELECT USING (
  channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid())
);

-- ── Agendamento de publicações ──
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  media_url       TEXT,
  media_type      TEXT, -- 'image', 'video'
  publish_at      TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, published, failed
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sp_channel_idx ON public.scheduled_posts(channel_id);
CREATE INDEX IF NOT EXISTS sp_publish_idx ON public.scheduled_posts(publish_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_posts TO authenticated;
GRANT ALL ON public.scheduled_posts TO service_role;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp own" ON public.scheduled_posts FOR ALL USING (
  channel_id IN (SELECT id FROM public.channels WHERE owner_id = auth.uid())
);

-- ── Realtime ──
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_analytics;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_earnings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
