-- ─────────────────────────────────────────────────────────────
-- CAIXA SURPRESA (Surprise Box) — mensagem-presente interativa.
-- Reaproveita os campos já existentes da mensagem (content,
-- media_url, message_type) para o conteúdo revelado; adiciona só
-- o necessário para a apresentação em caixa fechada.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_surprise         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surprise_teaser     text,              -- texto mostrado na caixa fechada
  ADD COLUMN IF NOT EXISTS surprise_opened_by  text[]  NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS messages_surprise_idx
  ON public.messages (is_surprise)
  WHERE is_surprise = true;

-- RPC: marca a caixa como aberta por este utilizador (append seguro,
-- mesmo padrão do mark_view_once_opened já existente).
CREATE OR REPLACE FUNCTION public.mark_surprise_opened(p_msg_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages
    SET surprise_opened_by = array_append(surprise_opened_by, p_user_id::text)
    WHERE id = p_msg_id
      AND NOT (p_user_id::text = ANY(surprise_opened_by));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_surprise_opened(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_surprise_opened(uuid, uuid) TO authenticated;
