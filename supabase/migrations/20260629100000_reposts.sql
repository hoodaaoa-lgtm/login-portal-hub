-- ═══════════════════════════════════════════
-- REPOSTS — repost simples + quote repost
-- ═══════════════════════════════════════════

-- Tabela de reposts
CREATE TABLE IF NOT EXISTS public.reposts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  quote_text  TEXT,                          -- NULL = repost simples; texto = quote repost
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)                   -- cada utilizador só pode repostar 1x o mesmo post
);

CREATE INDEX IF NOT EXISTS reposts_post_idx ON public.reposts(post_id);
CREATE INDEX IF NOT EXISTS reposts_user_idx ON public.reposts(user_id, created_at DESC);

ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reposts public read"  ON public.reposts FOR SELECT USING (true);
CREATE POLICY "reposts self insert"  ON public.reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reposts self delete"  ON public.reposts FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.reposts TO authenticated;
GRANT SELECT ON public.reposts TO anon;
GRANT ALL ON public.reposts TO service_role;

-- Coluna de contagem de reposts nos posts (para mostrar no card)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reposts_count INT NOT NULL DEFAULT 0;

-- Função para manter a contagem atualizada
CREATE OR REPLACE FUNCTION public.update_reposts_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reposts_count ON public.reposts;
CREATE TRIGGER trg_reposts_count
  AFTER INSERT OR DELETE ON public.reposts
  FOR EACH ROW EXECUTE FUNCTION public.update_reposts_count();
