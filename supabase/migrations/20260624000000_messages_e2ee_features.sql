-- ============================================================
-- messages E2EE + features completas
-- Alinha com a schema existente (message_type, reply_to)
-- e adiciona as colunas novas necessárias
-- ============================================================

-- 1. Novas colunas
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_for_all      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS view_once            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS view_once_opened_by  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reactions            JSONB   NOT NULL DEFAULT '{}';

-- 2. Tornar content nullable (para msgs de media sem texto)
ALTER TABLE public.messages
  ALTER COLUMN content DROP NOT NULL;

-- 3. Garantir que media_url já existe (veio da migração anterior)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url TEXT;

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS messages_conv_created
  ON public.messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS messages_deleted
  ON public.messages (deleted_for_all)
  WHERE deleted_for_all = TRUE;

CREATE INDEX IF NOT EXISTS messages_view_once
  ON public.messages (view_once)
  WHERE view_once = TRUE;

-- 5. Política DELETE para "eliminar para todos"
DROP POLICY IF EXISTS "msg delete own" ON public.messages;
CREATE POLICY "msg delete own" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- 6. GRANT DELETE
GRANT DELETE ON public.messages TO authenticated;

-- 7. RPC para marcar view_once como aberto (append seguro)
CREATE OR REPLACE FUNCTION public.mark_view_once_opened(p_msg_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  UPDATE public.messages
    SET view_once_opened_by = array_append(view_once_opened_by, p_user_id::text)
    WHERE id = p_msg_id
      AND NOT (p_user_id::text = ANY(view_once_opened_by));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_view_once_opened(uuid, uuid) TO authenticated;
