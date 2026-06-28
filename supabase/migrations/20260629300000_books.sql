-- ═══════════════════════════════════════════════════════
-- HOODA — Sistema de Livros
-- ═══════════════════════════════════════════════════════

-- 1. Tabela de livros
CREATE TABLE IF NOT EXISTS public.books (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  author_name   TEXT,
  description   TEXT,
  category      TEXT DEFAULT 'Outro',
  cover_url     TEXT,
  file_url      TEXT NOT NULL,
  file_format   TEXT DEFAULT 'PDF',
  downloads     BIGINT NOT NULL DEFAULT 0,
  saves         BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS books_downloads_idx ON public.books(downloads DESC);
CREATE INDEX IF NOT EXISTS books_saves_idx     ON public.books(saves DESC);
CREATE INDEX IF NOT EXISTS books_uploader_idx  ON public.books(uploader_id);
CREATE INDEX IF NOT EXISTS books_category_idx  ON public.books(category);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.books TO anon;
GRANT SELECT, INSERT, UPDATE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;

DROP POLICY IF EXISTS "books public read"   ON public.books;
DROP POLICY IF EXISTS "books self insert"   ON public.books;
DROP POLICY IF EXISTS "books self update"   ON public.books;
CREATE POLICY "books public read"  ON public.books FOR SELECT USING (true);
CREATE POLICY "books self insert"  ON public.books FOR INSERT WITH CHECK (auth.uid() = uploader_id);
CREATE POLICY "books self update"  ON public.books FOR UPDATE USING (auth.uid() = uploader_id);

-- 2. Livros guardados
CREATE TABLE IF NOT EXISTS public.book_saves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id    UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);

CREATE INDEX IF NOT EXISTS book_saves_user_idx ON public.book_saves(user_id);
CREATE INDEX IF NOT EXISTS book_saves_book_idx ON public.book_saves(book_id);

ALTER TABLE public.book_saves ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.book_saves TO authenticated;
GRANT ALL ON public.book_saves TO service_role;

DROP POLICY IF EXISTS "bs self read"   ON public.book_saves;
DROP POLICY IF EXISTS "bs self insert" ON public.book_saves;
DROP POLICY IF EXISTS "bs self delete" ON public.book_saves;
CREATE POLICY "bs self read"   ON public.book_saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bs self insert" ON public.book_saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bs self delete" ON public.book_saves FOR DELETE USING (auth.uid() = user_id);

-- 3. Downloads (para histórico)
CREATE TABLE IF NOT EXISTS public.book_downloads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id    UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS book_dl_book_idx ON public.book_downloads(book_id);

ALTER TABLE public.book_downloads ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON public.book_downloads TO authenticated;
GRANT ALL ON public.book_downloads TO service_role;
CREATE POLICY "bd insert" ON public.book_downloads FOR INSERT WITH CHECK (true);

-- 4. Storage buckets (executar separadamente se necessário)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('book-covers', 'book-covers', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('book-files', 'book-files', true) ON CONFLICT DO NOTHING;
