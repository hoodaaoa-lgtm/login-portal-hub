-- ============================================================
-- FIX: messages.receiver_id nullable
-- O banco de produção tem receiver_id NOT NULL mas o código
-- não o preenchia → 400 Bad Request ao enviar mensagens.
-- Esta migration torna receiver_id nullable e preenche os
-- valores em falta com o outro participante da conversa.
-- ============================================================

-- 1. Tornar receiver_id nullable (se a coluna existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'receiver_id'
  ) THEN
    ALTER TABLE public.messages
      ALTER COLUMN receiver_id DROP NOT NULL;

    -- 2. Preencher receiver_id NULL existentes com o outro participante
    UPDATE public.messages m
    SET receiver_id = (
      SELECT cp.user_id
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = m.conversation_id
        AND cp.user_id <> m.sender_id
      LIMIT 1
    )
    WHERE m.receiver_id IS NULL;
  ELSE
    -- Coluna não existe — adiciona como nullable para o código poder preencher
    ALTER TABLE public.messages
      ADD COLUMN IF NOT EXISTS receiver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
