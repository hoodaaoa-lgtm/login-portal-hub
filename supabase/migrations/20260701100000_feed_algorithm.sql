-- ═══════════════════════════════════════════════════════════════
-- HOODA — Algoritmo de Feed: impressões e interesses
-- ═══════════════════════════════════════════════════════════════

-- 1. post_impressions — regista quanto tempo o utilizador ficou em cada post
CREATE TABLE IF NOT EXISTS public.post_impressions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id      UUID NOT NULL,
  author_id    UUID,
  dwell_ms     INTEGER NOT NULL DEFAULT 0,   -- tempo em milissegundos
  kind         TEXT,                          -- 'post','clip','photo','bg'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)  -- uma impressão por utilizador por post (upsert)
);

CREATE INDEX IF NOT EXISTS pi_user_idx    ON public.post_impressions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pi_author_idx  ON public.post_impressions(author_id);
CREATE INDEX IF NOT EXISTS pi_post_idx    ON public.post_impressions(post_id);

ALTER TABLE public.post_impressions ENABLE ROW LEVEL SECURITY;
GRANT INSERT, UPDATE, SELECT ON public.post_impressions TO authenticated;
GRANT ALL ON public.post_impressions TO service_role;

CREATE POLICY "pi self read"   ON public.post_impressions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pi self insert" ON public.post_impressions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pi self update" ON public.post_impressions FOR UPDATE USING (auth.uid() = user_id);

-- 2. user_interests — interesses derivados do comportamento
CREATE TABLE IF NOT EXISTS public.user_interests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL,   -- autor cujo conteúdo o utilizador gosta
  score        FLOAT NOT NULL DEFAULT 0,  -- score acumulado de interesse
  interactions INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, author_id)
);

CREATE INDEX IF NOT EXISTS ui_user_idx ON public.user_interests(user_id, score DESC);

ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;
GRANT INSERT, UPDATE, SELECT ON public.user_interests TO authenticated;
GRANT ALL ON public.user_interests TO service_role;

CREATE POLICY "ui self read"   ON public.user_interests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ui self insert" ON public.user_interests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ui self update" ON public.user_interests FOR UPDATE USING (auth.uid() = user_id);
