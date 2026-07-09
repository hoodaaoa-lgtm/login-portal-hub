-- ============================================================================
-- Fase 6e — RPC para a edge function generate-post-embedding gravar o vetor
--
-- Mesmo padrão de apply_content_classification: SECURITY DEFINER porque
-- utilizadores normais só têm SELECT em posts.embedding (é metadado interno
-- do motor de ranking, não algo que a UI escreva), só a service role (via
-- edge function) pode gravar.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_post_embedding(
  p_post_id   UUID,
  p_embedding vector(768)
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.posts SET embedding = p_embedding WHERE id = p_post_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_post_embedding(UUID, vector) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_post_embedding(UUID, vector) TO service_role;

-- Fim.
