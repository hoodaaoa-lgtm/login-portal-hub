-- ============================================================
-- APLICAR TODAS AS CORRECÇÕES DE UMA VEZ
-- Executa no Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PARTE 1: messages — corrigir deleted_for_all + RLS completa
-- ────────────────────────────────────────────────────────────

-- Corrigir dados NULL existentes
UPDATE public.messages SET deleted_for_all = false WHERE deleted_for_all IS NULL;

-- Forçar NOT NULL com default
ALTER TABLE public.messages
  ALTER COLUMN deleted_for_all SET DEFAULT false,
  ALTER COLUMN deleted_for_all SET NOT NULL;

-- Adicionar colunas em falta (se não existirem)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type  text    DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url     text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to      uuid    REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS view_once     boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at     timestamptz;

-- receiver_id: tornar nullable (se existir) ou adicionar nullable
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'receiver_id'
  ) THEN
    ALTER TABLE public.messages ALTER COLUMN receiver_id DROP NOT NULL;
  ELSE
    ALTER TABLE public.messages ADD COLUMN receiver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Preencher receiver_id NULL com o outro participante
UPDATE public.messages m
SET receiver_id = (
  SELECT cp.user_id FROM public.conversation_participants cp
  WHERE cp.conversation_id = m.conversation_id AND cp.user_id <> m.sender_id
  LIMIT 1
)
WHERE m.receiver_id IS NULL;

-- Apagar TODAS as policies antigas de messages
DROP POLICY IF EXISTS "messages_select"              ON public.messages;
DROP POLICY IF EXISTS "messages_insert"              ON public.messages;
DROP POLICY IF EXISTS "messages_update"              ON public.messages;
DROP POLICY IF EXISTS "messages_delete"              ON public.messages;
DROP POLICY IF EXISTS "msg read participants"         ON public.messages;
DROP POLICY IF EXISTS "msg read participants strict"  ON public.messages;
DROP POLICY IF EXISTS "msg insert own"               ON public.messages;
DROP POLICY IF EXISTS "msg insert own strict"        ON public.messages;
DROP POLICY IF EXISTS "msg update"                   ON public.messages;
DROP POLICY IF EXISTS "msg update own"               ON public.messages;
DROP POLICY IF EXISTS "msg_select"                   ON public.messages;
DROP POLICY IF EXISTS "msg_insert"                   ON public.messages;
DROP POLICY IF EXISTS "msg_update"                   ON public.messages;
DROP POLICY IF EXISTS "msg_delete"                   ON public.messages;

-- Criar policies limpas (SEM deleted_for_all no SELECT)
CREATE POLICY "msg_select" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_delete" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- ────────────────────────────────────────────────────────────
-- PARTE 2: profiles — colunas de preferências em falta
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS read_receipts_off boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hide_last_seen    boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN msg_permission SET DEFAULT 'todos';

-- Actualizar perfis com msg_permission 'seguidores' por default
UPDATE public.profiles SET msg_permission = 'todos' WHERE msg_permission = 'seguidores';

-- ────────────────────────────────────────────────────────────
-- PARTE 3: muted_conversations
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.muted_conversations (
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  muted           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);
ALTER TABLE public.muted_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "muted own" ON public.muted_conversations;
CREATE POLICY "muted own" ON public.muted_conversations
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT ALL ON public.muted_conversations TO authenticated;

-- ────────────────────────────────────────────────────────────
-- PARTE 4: blocked_users
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocked own"  ON public.blocked_users;
DROP POLICY IF EXISTS "blocked_own"  ON public.blocked_users;
CREATE POLICY "blocked_own" ON public.blocked_users
  FOR ALL TO authenticated USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());
GRANT ALL ON public.blocked_users TO authenticated;

-- ────────────────────────────────────────────────────────────
-- PARTE 5: realtime (ignorar se já activo)
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
