
-- ─── user_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   TEXT,
  event_type   TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  author_id    UUID,
  category     TEXT,
  weight       NUMERIC DEFAULT 1,
  dwell_ms     INTEGER,
  context      JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_events_user_time_idx    ON public.user_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_target_idx       ON public.user_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS user_events_type_time_idx    ON public.user_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_author_idx       ON public.user_events(author_id);

GRANT SELECT, INSERT ON public.user_events TO authenticated;
GRANT SELECT, INSERT ON public.user_events TO anon;
GRANT USAGE ON SEQUENCE public.user_events_id_seq TO authenticated, anon;
GRANT ALL ON public.user_events TO service_role;
GRANT ALL ON SEQUENCE public.user_events_id_seq TO service_role;

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_events insert own or anon"
  ON public.user_events FOR INSERT
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

CREATE POLICY "user_events select own"
  ON public.user_events FOR SELECT
  USING (user_id = auth.uid());

-- ─── user_interest_scores ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_interest_scores (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  score_short   NUMERIC NOT NULL DEFAULT 0,  -- ~7 dias
  score_medium  NUMERIC NOT NULL DEFAULT 0,  -- ~30 dias
  score_long    NUMERIC NOT NULL DEFAULT 0,  -- ~180 dias
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

CREATE INDEX IF NOT EXISTS user_interest_scores_user_idx ON public.user_interest_scores(user_id, score_short DESC);

GRANT SELECT ON public.user_interest_scores TO authenticated;
GRANT ALL ON public.user_interest_scores TO service_role;

ALTER TABLE public.user_interest_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interest_scores select own"
  ON public.user_interest_scores FOR SELECT
  USING (user_id = auth.uid());

-- ─── RPC: track_event ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_event(
  p_event_type  TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id   TEXT DEFAULT NULL,
  p_author_id   UUID DEFAULT NULL,
  p_category    TEXT DEFAULT NULL,
  p_weight      NUMERIC DEFAULT 1,
  p_dwell_ms    INTEGER DEFAULT NULL,
  p_session_id  TEXT DEFAULT NULL,
  p_context     JSONB DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_weight NUMERIC := COALESCE(p_weight, 1);
BEGIN
  INSERT INTO public.user_events(
    user_id, session_id, event_type, target_type, target_id,
    author_id, category, weight, dwell_ms, context
  ) VALUES (
    v_uid, p_session_id, p_event_type, p_target_type, p_target_id,
    p_author_id, p_category, v_weight, p_dwell_ms, COALESCE(p_context, '{}'::jsonb)
  );

  -- Atualização incremental do perfil (só faz sentido se autenticado e categoria conhecida)
  IF v_uid IS NOT NULL AND p_category IS NOT NULL AND p_category <> '' THEN
    INSERT INTO public.user_interest_scores(user_id, category, score_short, score_medium, score_long, updated_at)
    VALUES (v_uid, p_category, v_weight, v_weight, v_weight, now())
    ON CONFLICT (user_id, category) DO UPDATE
      SET score_short  = user_interest_scores.score_short  + EXCLUDED.score_short,
          score_medium = user_interest_scores.score_medium + EXCLUDED.score_medium,
          score_long   = user_interest_scores.score_long   + EXCLUDED.score_long,
          updated_at   = now();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_event(TEXT,TEXT,TEXT,UUID,TEXT,NUMERIC,INTEGER,TEXT,JSONB) TO authenticated, anon;

-- ─── RPC: get_user_interest_profile ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_interest_profile(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(category TEXT, score_short NUMERIC, score_medium NUMERIC, score_long NUMERIC, combined NUMERIC)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT category,
         score_short,
         score_medium,
         score_long,
         (0.5 * score_short + 0.3 * score_medium + 0.2 * score_long) AS combined
  FROM public.user_interest_scores
  WHERE user_id = auth.uid()
  ORDER BY combined DESC
  LIMIT COALESCE(p_limit, 20);
$$;

GRANT EXECUTE ON FUNCTION public.get_user_interest_profile(INTEGER) TO authenticated;

-- ─── RPC: decay_interest_scores (para cron futuro) ────────────────────
CREATE OR REPLACE FUNCTION public.decay_interest_scores()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_interest_scores
     SET score_short  = score_short  * 0.90,
         score_medium = score_medium * 0.97,
         score_long   = score_long   * 0.995,
         updated_at   = now()
   WHERE updated_at < now() - INTERVAL '1 hour';
$$;
