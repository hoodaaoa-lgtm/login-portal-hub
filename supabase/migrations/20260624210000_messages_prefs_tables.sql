-- ============================================================
-- Preferências de mensagens + tabelas muted/blocked
-- ============================================================

-- 1. Colunas em falta na tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS read_receipts_off BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hide_last_seen    BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Tabela muted_conversations
CREATE TABLE IF NOT EXISTS public.muted_conversations (
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  muted           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);
ALTER TABLE public.muted_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "muted own" ON public.muted_conversations;
CREATE POLICY "muted own" ON public.muted_conversations
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 3. Tabela blocked_users
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blocked own" ON public.blocked_users;
CREATE POLICY "blocked own" ON public.blocked_users
  FOR ALL TO authenticated USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

-- 4. Grants
GRANT ALL ON public.muted_conversations TO authenticated;
GRANT ALL ON public.blocked_users TO authenticated;
