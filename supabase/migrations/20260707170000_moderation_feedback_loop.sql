-- ============================================================================
-- Fecha o ciclo de aprendizagem da Fase 6: até aqui, "Ocultar semelhantes"
-- gravava em user_hidden_categories mas nada usava essa preferência para
-- filtrar o feed — o utilizador continuava a ver o mesmo tipo de conteúdo.
-- Agora a política de leitura de posts exclui, para esse utilizador
-- específico, qualquer post cujo moderation_status esteja na lista que ele
-- escolheu ocultar (nunca afeta os próprios posts do utilizador, nem o admin).
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

DROP POLICY IF EXISTS "posts_read_published_or_own" ON public.posts;
CREATE POLICY "posts_read_published_or_own"
  ON public.posts FOR SELECT
  USING (
    (
      is_draft = false
      AND (scheduled_at IS NULL OR scheduled_at <= now())
      AND moderation_status <> 'illegal'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_hidden_categories uhc
        WHERE uhc.user_id = auth.uid() AND uhc.category = moderation_status
      )
    )
    OR author_id = auth.uid()
    OR public.is_hooda_admin()
  );

-- ── Backfill: criar/recalcular a linha de qualidade para todos os posts
--    que já existem (novos já ficam cobertos pelo trigger de INSERT).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.posts LOOP
    PERFORM public.recompute_content_quality(r.id);
  END LOOP;
END $$;

-- Fim.
