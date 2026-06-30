-- ── Avaliações de livros (Rating) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.book_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id         UUID NOT NULL REFERENCES public.stories_books(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars           INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(book_id, user_id)
);
CREATE INDEX IF NOT EXISTS br_book_idx ON public.book_ratings(book_id);
CREATE INDEX IF NOT EXISTS br_user_idx ON public.book_ratings(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_ratings TO authenticated;
GRANT ALL ON public.book_ratings TO service_role;
ALTER TABLE public.book_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "br read all" ON public.book_ratings FOR SELECT USING (true);
CREATE POLICY "br insert own" ON public.book_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "br update own" ON public.book_ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "br delete own" ON public.book_ratings FOR DELETE USING (auth.uid() = user_id);

-- ── Livros guardados (Saved Books) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_books (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id         UUID NOT NULL REFERENCES public.stories_books(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);
CREATE INDEX IF NOT EXISTS sb_user_idx ON public.saved_books(user_id);
CREATE INDEX IF NOT EXISTS sb_book_idx ON public.saved_books(book_id);
GRANT SELECT, INSERT, DELETE ON public.saved_books TO authenticated;
GRANT ALL ON public.saved_books TO service_role;
ALTER TABLE public.saved_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sb read own" ON public.saved_books FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sb insert own" ON public.saved_books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sb delete own" ON public.saved_books FOR DELETE USING (auth.uid() = user_id);

-- ── Adicionar colunas de estatísticas à tabela stories_books ───────
ALTER TABLE public.stories_books
ADD COLUMN IF NOT EXISTS downloads_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS sb_downloads_idx ON public.stories_books(downloads_count DESC);
CREATE INDEX IF NOT EXISTS sb_rating_idx ON public.stories_books(average_rating DESC);

-- ── Função RPC para incrementar downloads e atualizar média de rating ──
CREATE OR REPLACE FUNCTION public.increment_book_download(p_book_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.stories_books
  SET downloads_count = COALESCE(downloads_count, 0) + 1,
      updated_at = now()
  WHERE id = p_book_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_book_download TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_book_download TO anon;

-- ── Função RPC para atualizar média de rating do livro ──
CREATE OR REPLACE FUNCTION public.update_book_rating_average(p_book_id UUID)
RETURNS TABLE(avg_rating DECIMAL, count INTEGER) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg DECIMAL;
  v_count INTEGER;
BEGIN
  SELECT AVG(stars)::DECIMAL(3,2), COUNT(*)
  INTO v_avg, v_count
  FROM public.book_ratings
  WHERE book_id = p_book_id;
  
  UPDATE public.stories_books
  SET average_rating = COALESCE(v_avg, 0.0),
      rating_count = COALESCE(v_count, 0),
      updated_at = now()
  WHERE id = p_book_id;
  
  RETURN QUERY SELECT COALESCE(v_avg, 0.0), COALESCE(v_count, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_book_rating_average TO authenticated;

-- ── Realtime para ratings e downloads ───────────────────────────────
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.book_ratings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_books;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
