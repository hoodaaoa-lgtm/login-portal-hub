-- ═══════════════════════════════════════════════
-- Views de posts de vídeo/clip no feed
-- ═══════════════════════════════════════════════

-- Tabela de views de posts
CREATE TABLE IF NOT EXISTS public.post_views (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id            UUID        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewer_fingerprint TEXT        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS post_views_unique_idx
  ON public.post_views(post_id, viewer_fingerprint);
CREATE INDEX IF NOT EXISTS post_views_post_idx ON public.post_views(post_id);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_views_insert" ON public.post_views FOR INSERT WITH CHECK (true);
CREATE POLICY "post_views_read"   ON public.post_views FOR SELECT USING (true);
GRANT SELECT, INSERT ON public.post_views TO authenticated, anon;
GRANT ALL ON public.post_views TO service_role;

-- Coluna views_count nos posts (se não existir)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS views_count BIGINT NOT NULL DEFAULT 0;

-- Função RPC chamada pelo frontend
CREATE OR REPLACE FUNCTION public.record_post_view(
  p_post_id            UUID,
  p_viewer_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_counted BOOLEAN := false;
BEGIN
  -- Inserir view única (fingerprint + post)
  INSERT INTO public.post_views(post_id, viewer_fingerprint)
    VALUES (p_post_id, p_viewer_fingerprint)
  ON CONFLICT (post_id, viewer_fingerprint) DO NOTHING;

  -- Só incrementa se inseriu de facto
  IF FOUND THEN
    UPDATE public.posts
      SET views_count = views_count + 1
      WHERE id = p_post_id
        AND kind IN ('video','clip');
    v_counted := true;
  END IF;

  RETURN jsonb_build_object('counted', v_counted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_post_view TO authenticated, anon;
