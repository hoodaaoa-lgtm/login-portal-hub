-- ============================================================================
-- Fase 2 — Classificação automática de conteúdo (texto → vídeo)
-- Taxonomia global de categorias + tabela de classificações por post,
-- geradas por IA (google/gemini-2.5-flash via Lovable AI Gateway) a partir
-- de título + conteúdo + hashtags. A classificação multimodal (frames de
-- vídeo/imagem + transcrição) fica para uma 2ª etapa assíncrona (worker),
-- ver .lovable/plan.md.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────
-- 1. Taxonomia global — categorias e subcategorias
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES public.content_categories(id) ON DELETE SET NULL,
  -- true quando a categoria foi criada automaticamente pela IA (subcategoria
  -- nova, ainda não revista por um humano) em vez de fazer parte da lista
  -- inicial curada.
  is_auto     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_categories_parent_idx ON public.content_categories(parent_id);

ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.content_categories TO authenticated, anon;
GRANT ALL ON public.content_categories TO service_role;

DROP POLICY IF EXISTS "content_categories public read" ON public.content_categories;
CREATE POLICY "content_categories public read" ON public.content_categories
  FOR SELECT TO authenticated, anon USING (true);

-- Só o admin (via painel) e a service role (via edge functions) escrevem
-- diretamente na taxonomia; a criação automática de subcategorias passa
-- pela função abaixo, que corre com privilégios elevados.
DROP POLICY IF EXISTS "content_categories admin write" ON public.content_categories;
CREATE POLICY "content_categories admin write" ON public.content_categories
  FOR ALL TO authenticated
  USING ( public.is_hooda_admin() )
  WITH CHECK ( public.is_hooda_admin() );

-- Categorias base (idempotente — não duplica se já existirem).
INSERT INTO public.content_categories (slug, name) VALUES
  ('tecnologia',  'Tecnologia'),
  ('programacao', 'Programação'),
  ('ia',          'IA'),
  ('jogos',       'Jogos'),
  ('musica',      'Música'),
  ('esportes',    'Esportes'),
  ('fotografia',  'Fotografia'),
  ('negocios',    'Negócios'),
  ('educacao',    'Educação'),
  ('ciencia',     'Ciência'),
  ('moda',        'Moda'),
  ('viagens',     'Viagens'),
  ('automoveis',  'Automóveis'),
  ('cinema',      'Cinema'),
  ('culinaria',   'Culinária'),
  ('arte',        'Arte'),
  ('humor',       'Humor')
ON CONFLICT (slug) DO NOTHING;

-- Chamada pela edge function de classificação sempre que a IA devolve uma
-- categoria/subcategoria que ainda não existe na taxonomia (ex.: "React",
-- filha de "programacao"). SECURITY DEFINER porque utilizadores normais só
-- têm SELECT na tabela.
CREATE OR REPLACE FUNCTION public.upsert_content_category(
  p_slug      TEXT,
  p_name      TEXT,
  p_parent_slug TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_id        UUID;
BEGIN
  IF p_parent_slug IS NOT NULL THEN
    SELECT id INTO v_parent_id FROM public.content_categories WHERE slug = p_parent_slug;
  END IF;

  INSERT INTO public.content_categories (slug, name, parent_id, is_auto)
  VALUES (p_slug, p_name, v_parent_id, true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_content_category(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_content_category(TEXT, TEXT, TEXT) TO service_role, authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 2. Classificações geradas por IA para cada post
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.post_classifications (
  post_id     UUID PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  -- [{ "slug": "tecnologia", "name": "Tecnologia", "score": 94 }, ...]
  categories  JSONB NOT NULL DEFAULT '[]'::jsonb,
  keywords    TEXT[] NOT NULL DEFAULT '{}',
  entities    TEXT[] NOT NULL DEFAULT '{}',
  sentiment   TEXT,
  -- 'text' nesta 1ª etapa; 'multimodal' quando a 2ª etapa (frames + áudio)
  -- correr para posts de vídeo/imagem.
  source      TEXT NOT NULL DEFAULT 'text',
  model       TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_classifications_categories_idx
  ON public.post_classifications USING gin (categories);

ALTER TABLE public.post_classifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.post_classifications TO authenticated, anon;
GRANT ALL ON public.post_classifications TO service_role;

DROP POLICY IF EXISTS "post_classifications public read" ON public.post_classifications;
CREATE POLICY "post_classifications public read" ON public.post_classifications
  FOR SELECT TO authenticated, anon USING (true);

-- RPC usada pela edge function "classify-content" para gravar o resultado.
CREATE OR REPLACE FUNCTION public.apply_content_classification(
  p_post_id    UUID,
  p_categories JSONB,
  p_keywords   TEXT[],
  p_entities   TEXT[],
  p_sentiment  TEXT,
  p_source     TEXT DEFAULT 'text'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.post_classifications (post_id, categories, keywords, entities, sentiment, source, classified_at)
  VALUES (p_post_id, p_categories, p_keywords, p_entities, p_sentiment, p_source, now())
  ON CONFLICT (post_id) DO UPDATE SET
    categories    = EXCLUDED.categories,
    keywords      = EXCLUDED.keywords,
    entities      = EXCLUDED.entities,
    sentiment     = EXCLUDED.sentiment,
    source        = EXCLUDED.source,
    classified_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_content_classification(UUID, JSONB, TEXT[], TEXT[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_content_classification(UUID, JSONB, TEXT[], TEXT[], TEXT, TEXT) TO service_role;

-- Fim.
