-- Biblioteca digital pública: livros com capa, PDF (base64, máx 1MB), categoria, views e downloads
CREATE TABLE IF NOT EXISTS public.library_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploader_username text NOT NULL DEFAULT '',
  title text NOT NULL,
  author_name text NOT NULL,
  category text NOT NULL DEFAULT 'Geral',
  description text NOT NULL DEFAULT '',
  cover_url text,
  cover_color text NOT NULL DEFAULT '#5B3FCF',
  file_data text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  file_name text NOT NULL DEFAULT 'livro.pdf',
  views_count integer NOT NULL DEFAULT 0,
  downloads_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "library_books read all" ON public.library_books
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "library_books insert own" ON public.library_books
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "library_books update own or counters" ON public.library_books
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "library_books delete own" ON public.library_books
  FOR DELETE TO authenticated USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_library_books_created_at ON public.library_books (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_library_books_downloads ON public.library_books (downloads_count DESC);
CREATE INDEX IF NOT EXISTS idx_library_books_category ON public.library_books (category);
