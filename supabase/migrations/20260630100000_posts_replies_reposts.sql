-- ── Tabela de respostas (replies) a posts ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_replies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_username TEXT NOT NULL,
  author_color    TEXT NOT NULL DEFAULT '#5B3FCF',
  content         TEXT NOT NULL,
  media_url       TEXT,
  media_type      TEXT, -- 'image', 'video'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pr_post_idx ON public.post_replies(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pr_author_idx ON public.post_replies(author_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_replies TO authenticated;
GRANT ALL ON public.post_replies TO service_role;
ALTER TABLE public.post_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr read all" ON public.post_replies FOR SELECT USING (true);
CREATE POLICY "pr insert own" ON public.post_replies FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "pr update own" ON public.post_replies FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "pr delete own" ON public.post_replies FOR DELETE USING (auth.uid() = author_id);

-- ── Tabela de reposts (simples) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_reposts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_reposts_post_idx ON public.post_reposts(post_id);
CREATE INDEX IF NOT EXISTS post_reposts_user_idx ON public.post_reposts(user_id);
GRANT SELECT, INSERT, DELETE ON public.post_reposts TO authenticated;
GRANT ALL ON public.post_reposts TO service_role;
ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_reposts read all" ON public.post_reposts FOR SELECT USING (true);
CREATE POLICY "post_reposts insert own" ON public.post_reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_reposts delete own" ON public.post_reposts FOR DELETE USING (auth.uid() = user_id);

-- ── Tabela de quote reposts (com conteúdo próprio) ──────────────────────
CREATE TABLE IF NOT EXISTS public.post_quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_username TEXT NOT NULL,
  content         TEXT NOT NULL,
  media_url       TEXT,
  media_type      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pq_original_idx ON public.post_quotes(original_post_id);
CREATE INDEX IF NOT EXISTS pq_author_idx ON public.post_quotes(author_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_quotes TO authenticated;
GRANT ALL ON public.post_quotes TO service_role;
ALTER TABLE public.post_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pq read all" ON public.post_quotes FOR SELECT USING (true);
CREATE POLICY "pq insert own" ON public.post_quotes FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "pq update own" ON public.post_quotes FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "pq delete own" ON public.post_quotes FOR DELETE USING (auth.uid() = author_id);

-- ── Adicionar coluna de contadores em posts ──────────────────────────────
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS replies_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS reposts_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS quotes_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS posts_replies_idx ON public.posts(replies_count DESC);
CREATE INDEX IF NOT EXISTS posts_reposts_idx ON public.posts(reposts_count DESC);

-- ── Funções RPC para incrementar contadores ──────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_post_replies(p_post_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.posts
  SET replies_count = COALESCE(replies_count, 0) + 1
  WHERE id = p_post_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_post_replies TO authenticated;

CREATE OR REPLACE FUNCTION public.decrement_post_replies(p_post_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.posts
  SET replies_count = GREATEST(0, COALESCE(replies_count, 1) - 1)
  WHERE id = p_post_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decrement_post_replies TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_post_reposts(p_post_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.posts
  SET reposts_count = COALESCE(reposts_count, 0) + 1
  WHERE id = p_post_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_post_reposts TO authenticated;

CREATE OR REPLACE FUNCTION public.decrement_post_reposts(p_post_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.posts
  SET reposts_count = GREATEST(0, COALESCE(reposts_count, 1) - 1)
  WHERE id = p_post_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decrement_post_reposts TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_post_quotes(p_post_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.posts
  SET quotes_count = COALESCE(quotes_count, 0) + 1
  WHERE id = p_post_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_post_quotes TO authenticated;

-- ── Realtime para respostas, reposts e quotes ────────────────────────────
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_replies;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reposts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_quotes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
