-- ============================================================
-- FIX CRÍTICO: mensagens desaparecem ao refresh
-- A policy SELECT exigia deleted_for_all = FALSE mas linhas
-- inseridas com deleted_for_all = false (booleano JS) podem
-- chegar ao Postgres como NULL em certas condições, o que faz
-- a condição FALSE falhar e bloqueia todas as mensagens.
-- ============================================================

-- 1. Garantir que todas as linhas existentes têm deleted_for_all = false (não NULL)
UPDATE public.messages
  SET deleted_for_all = false
  WHERE deleted_for_all IS NULL;

-- 2. Forçar NOT NULL com default na coluna
ALTER TABLE public.messages
  ALTER COLUMN deleted_for_all SET NOT NULL,
  ALTER COLUMN deleted_for_all SET DEFAULT false;

-- 3. Recriar a policy SELECT sem a condição deleted_for_all
--    (o .neq("deleted_for_all", true) no cliente já filtra as apagadas)
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "msg read participants" ON public.messages;
DROP POLICY IF EXISTS "msg read participants strict" ON public.messages;

CREATE POLICY "messages_select" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- 4. Garantir realtime activado (ignorar se já estiver na publicação)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
