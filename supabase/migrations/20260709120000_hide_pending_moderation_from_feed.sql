-- ============================================================================
-- Esconder publicações "pending" (ainda não analisadas pela IA) do feed
-- público. Até agora só 'illegal' era excluído — 'pending' ficava visível
-- a toda a gente durante a janela entre o INSERT e a moderate-content
-- terminar, o que podia mostrar conteúdo não analisado a outros
-- utilizadores por alguns segundos.
--
-- Agora: enquanto moderation_status = 'pending', só o próprio autor (e o
-- admin) vê a publicação. Assim que a edge function "moderate-content"
-- grava o resultado final (safe/sensitive/nudity/violence/harassment/
-- spam/scam/illegal), a publicação passa a seguir a regra normal
-- (visível a todos, exceto 'illegal').
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

DROP POLICY IF EXISTS "posts_read_published_or_own" ON public.posts;
CREATE POLICY "posts_read_published_or_own"
  ON public.posts FOR SELECT
  USING (
    (is_draft = false AND (scheduled_at IS NULL OR scheduled_at <= now())
       AND moderation_status NOT IN ('illegal', 'pending'))
    OR author_id = auth.uid()
    OR public.is_hooda_admin()
  );

-- Fim.
