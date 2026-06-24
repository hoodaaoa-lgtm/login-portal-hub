-- ============================================================
-- RESET COMPLETO das policies de messages
-- Problema: deleted_for_all = FALSE na RLS bloqueia linhas NULL
-- ============================================================

-- 1. Corrigir dados existentes com NULL
UPDATE public.messages SET deleted_for_all = false WHERE deleted_for_all IS NULL;

-- 2. Garantir coluna NOT NULL
ALTER TABLE public.messages
  ALTER COLUMN deleted_for_all SET DEFAULT false,
  ALTER COLUMN deleted_for_all SET NOT NULL;

-- 3. Apagar TODAS as policies antigas de messages
DROP POLICY IF EXISTS "messages_select"             ON public.messages;
DROP POLICY IF EXISTS "messages_insert"             ON public.messages;
DROP POLICY IF EXISTS "messages_update"             ON public.messages;
DROP POLICY IF EXISTS "messages_delete"             ON public.messages;
DROP POLICY IF EXISTS "msg read participants"        ON public.messages;
DROP POLICY IF EXISTS "msg read participants strict" ON public.messages;
DROP POLICY IF EXISTS "msg insert own"              ON public.messages;
DROP POLICY IF EXISTS "msg insert own strict"       ON public.messages;
DROP POLICY IF EXISTS "msg update"                  ON public.messages;
DROP POLICY IF EXISTS "msg update own"              ON public.messages;

-- 4. Criar policies limpas (sem condição deleted_for_all no SELECT)
CREATE POLICY "msg_select" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_delete" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- 5. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
