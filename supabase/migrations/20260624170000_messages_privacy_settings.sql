-- ─── Colunas de privacidade no perfil ────────────────────────────────────────
-- Usadas em Mensagens: confirmações de leitura e última vez ativo

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS read_receipts_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_last_seen    boolean NOT NULL DEFAULT false;

-- ─── Tabela de conversas silenciadas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.muted_conversations (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  muted           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.muted_conversations TO authenticated;
GRANT ALL ON public.muted_conversations TO service_role;
ALTER TABLE public.muted_conversations ENABLE ROW LEVEL SECURITY;

-- Só o próprio utilizador pode ver/gerir os seus silenciamentos
CREATE POLICY "muted_conv_own" ON public.muted_conversations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
