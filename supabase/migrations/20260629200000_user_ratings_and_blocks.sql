-- ── Avaliações de utilizadores (Rating) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rated_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rater_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars           INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rated_user_id, rater_user_id)
);
CREATE INDEX IF NOT EXISTS ur_rated_idx ON public.user_ratings(rated_user_id);
CREATE INDEX IF NOT EXISTS ur_rater_idx ON public.user_ratings(rater_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ratings TO authenticated;
GRANT ALL ON public.user_ratings TO service_role;
ALTER TABLE public.user_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ur read all" ON public.user_ratings FOR SELECT USING (true);
CREATE POLICY "ur insert own" ON public.user_ratings FOR INSERT WITH CHECK (auth.uid() = rater_user_id);
CREATE POLICY "ur update own" ON public.user_ratings FOR UPDATE USING (auth.uid() = rater_user_id);
CREATE POLICY "ur delete own" ON public.user_ratings FOR DELETE USING (auth.uid() = rater_user_id);

-- ── Reportar utilizador ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending, reviewed, dismissed
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS usr_reported_idx ON public.user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS usr_status_idx ON public.user_reports(status);
GRANT SELECT, INSERT ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usr read own" ON public.user_reports FOR SELECT USING (auth.uid() = reporter_id OR auth.uid() = reported_user_id);
CREATE POLICY "usr insert own" ON public.user_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ── Realtime para ratings ─────────────────────────────────────────────────
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ratings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
