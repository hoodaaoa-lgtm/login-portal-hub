-- ============================================================================
-- Fase 6 — Moderação e conteúdo sensível
-- Classificação automática (seguro/sensível/nudez/violência/assédio/spam/
-- golpe/ilegal), blur + aviso na UI, aprendizagem a partir da escolha do
-- utilizador, e deteção heurística de spam.
-- Depende de public.is_hooda_admin() (20260705000000_official_admin_messages.sql)
-- e public.admin_audit_log (20260706170000_admin_audit_log.sql).
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────
-- 1. Colunas de moderação em posts
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS moderation_status     TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS moderation_categories  JSONB,
  ADD COLUMN IF NOT EXISTS is_sensitive           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_checked_at  TIMESTAMPTZ;

ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_moderation_status_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_moderation_status_check
  CHECK (moderation_status IN (
    'pending', 'safe', 'sensitive', 'nudity', 'violence',
    'harassment', 'spam', 'scam', 'illegal'
  ));

CREATE INDEX IF NOT EXISTS posts_moderation_status_idx ON public.posts(moderation_status);
CREATE INDEX IF NOT EXISTS posts_is_sensitive_idx       ON public.posts(is_sensitive) WHERE is_sensitive;

-- ───────────────────────────────────────────────────────────────────────
-- 2. Log de moderação — histórico de cada classificação (auditoria/debug)
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_moderation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  model       TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  category    TEXT NOT NULL,
  confidence  NUMERIC,
  raw_result  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cml_post_idx ON public.content_moderation_log(post_id, created_at DESC);

ALTER TABLE public.content_moderation_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.content_moderation_log TO authenticated;
GRANT ALL ON public.content_moderation_log TO service_role;

DROP POLICY IF EXISTS "cml admin read" ON public.content_moderation_log;
CREATE POLICY "cml admin read" ON public.content_moderation_log
  FOR SELECT TO authenticated
  USING ( public.is_hooda_admin() );

-- ───────────────────────────────────────────────────────────────────────
-- 3. Preferências de ocultação — aprendizagem a partir da escolha do
--    utilizador ("Ocultar conteúdos semelhantes")
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_hidden_categories (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

ALTER TABLE public.user_hidden_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.user_hidden_categories TO authenticated;
GRANT ALL ON public.user_hidden_categories TO service_role;

DROP POLICY IF EXISTS "uhc self read"   ON public.user_hidden_categories;
DROP POLICY IF EXISTS "uhc self write"  ON public.user_hidden_categories;
DROP POLICY IF EXISTS "uhc self delete" ON public.user_hidden_categories;
CREATE POLICY "uhc self read"   ON public.user_hidden_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "uhc self write"  ON public.user_hidden_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uhc self delete" ON public.user_hidden_categories FOR DELETE USING (auth.uid() = user_id);

-- RPC chamada pelo botão "Ocultar conteúdos semelhantes"
CREATE OR REPLACE FUNCTION public.hide_similar_content(p_category TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  INSERT INTO public.user_hidden_categories (user_id, category)
  VALUES (auth.uid(), p_category)
  ON CONFLICT (user_id, category) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.hide_similar_content(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hide_similar_content(TEXT) TO authenticated;

-- RPC para desfazer ("voltar a mostrar esta categoria")
CREATE OR REPLACE FUNCTION public.unhide_category(p_category TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_hidden_categories WHERE user_id = auth.uid() AND category = p_category;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.unhide_category(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unhide_category(TEXT) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 4. RPC usada pela edge function "moderate-content" para gravar o
--    resultado (a função corre com a service role key, por isso já
--    ignora RLS — mas expomos a RPC também para uso interno consistente).
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_content_moderation(
  p_post_id    UUID,
  p_category   TEXT,
  p_confidence NUMERIC,
  p_raw_result JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.posts SET
    moderation_status    = p_category,
    moderation_categories = COALESCE(p_raw_result, moderation_categories),
    is_sensitive         = p_category IN ('sensitive','nudity','violence','harassment'),
    moderation_checked_at = now()
  WHERE id = p_post_id;

  INSERT INTO public.content_moderation_log (post_id, category, confidence, raw_result)
  VALUES (p_post_id, p_category, p_confidence, p_raw_result);
END;
$$;
-- Só o service_role (a edge function) e o admin podem chamar isto.
REVOKE EXECUTE ON FUNCTION public.apply_content_moderation(UUID, TEXT, NUMERIC, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_content_moderation(UUID, TEXT, NUMERIC, JSONB) TO service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 5. Deteção heurística de spam (sem depender de IA):
--    - Mais de 6 publicações do mesmo autor em 2 minutos.
--    - Conteúdo textual idêntico repetido pelo mesmo autor em 24h.
--    Nunca bloqueia a publicação (para não travar utilizadores legítimos
--    em picos de atividade) — apenas marca como 'spam' para o feed/ranking
--    poder penalizar a distribuição.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.flag_spam_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_recent_count   INTEGER;
  v_duplicate_count INTEGER;
BEGIN
  IF NEW.author_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.posts
  WHERE author_id = NEW.author_id
    AND created_at > now() - INTERVAL '2 minutes';

  SELECT COUNT(*) INTO v_duplicate_count
  FROM public.posts
  WHERE author_id = NEW.author_id
    AND content = NEW.content
    AND length(trim(NEW.content)) > 0
    AND created_at > now() - INTERVAL '24 hours';

  IF v_recent_count >= 6 OR v_duplicate_count >= 2 THEN
    NEW.moderation_status := 'spam';
    NEW.is_sensitive := true;
    NEW.moderation_checked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_spam_before_insert ON public.posts;
CREATE TRIGGER trg_flag_spam_before_insert
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.flag_spam_before_insert();

-- ───────────────────────────────────────────────────────────────────────
-- 6. Conteúdo "illegal" com confiança alta nunca fica visível no feed
--    público — mesmo que ainda ninguém tenha denunciado. Ajustamos a
--    política de leitura existente para excluir esse estado, exceto
--    para o próprio autor e para o admin.
-- ───────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "posts_read_published_or_own" ON public.posts;
CREATE POLICY "posts_read_published_or_own"
  ON public.posts FOR SELECT
  USING (
    (is_draft = false AND (scheduled_at IS NULL OR scheduled_at <= now())
       AND moderation_status <> 'illegal')
    OR author_id = auth.uid()
    OR public.is_hooda_admin()
  );

-- Fim.
