-- ============================================================================
-- Entrega de Conteúdo — chat do admin com a IA que ajusta o algoritmo do feed.
--
-- Guarda o histórico da conversa (admin <-> IA) para que a IA tenha memória
-- entre sessões ("da última vez pediste mais vídeos, já apliquei"). A IA
-- nunca aplica mudanças sozinha — cada resposta pode incluir uma proposta
-- de novos pesos (`proposed_weights`), e só é aplicada quando o admin
-- confirma explicitamente (chama admin_update_algorithm_weights, já
-- existente, a partir do frontend).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feed_ai_chat_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('admin', 'assistant')),
  content           TEXT NOT NULL,
  proposed_weights  JSONB,              -- pesos sugeridos pela IA nesta mensagem, se houver
  applied           BOOLEAN NOT NULL DEFAULT false, -- true depois do admin confirmar a proposta
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_ai_chat_admin_created
  ON public.feed_ai_chat_messages (admin_id, created_at);

ALTER TABLE public.feed_ai_chat_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.feed_ai_chat_messages TO authenticated;
GRANT ALL ON public.feed_ai_chat_messages TO service_role;

DROP POLICY IF EXISTS "feed_ai_chat admin read" ON public.feed_ai_chat_messages;
CREATE POLICY "feed_ai_chat admin read" ON public.feed_ai_chat_messages
  FOR SELECT TO authenticated USING ( public.is_hooda_admin() );

DROP POLICY IF EXISTS "feed_ai_chat admin insert" ON public.feed_ai_chat_messages;
CREATE POLICY "feed_ai_chat admin insert" ON public.feed_ai_chat_messages
  FOR INSERT TO authenticated WITH CHECK ( public.is_hooda_admin() );

DROP POLICY IF EXISTS "feed_ai_chat admin update" ON public.feed_ai_chat_messages;
CREATE POLICY "feed_ai_chat admin update" ON public.feed_ai_chat_messages
  FOR UPDATE TO authenticated
  USING ( public.is_hooda_admin() )
  WITH CHECK ( public.is_hooda_admin() );

-- Marca a proposta de pesos de uma mensagem como aplicada, depois do admin
-- confirmar e o admin_update_algorithm_weights já ter corrido com sucesso.
CREATE OR REPLACE FUNCTION public.mark_feed_ai_proposal_applied(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'apenas administradores';
  END IF;

  UPDATE public.feed_ai_chat_messages
  SET applied = true
  WHERE id = p_message_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_feed_ai_proposal_applied(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_feed_ai_proposal_applied(UUID) TO authenticated;

-- Devolve as últimas N mensagens do chat, para popular o histórico no frontend
-- e dar contexto à IA a cada novo pedido.
CREATE OR REPLACE FUNCTION public.get_feed_ai_chat_history(p_limit INTEGER DEFAULT 50)
RETURNS SETOF public.feed_ai_chat_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'apenas administradores';
  END IF;

  RETURN QUERY
    SELECT * FROM public.feed_ai_chat_messages
    ORDER BY created_at DESC
    LIMIT p_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_feed_ai_chat_history(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed_ai_chat_history(INTEGER) TO authenticated;
