-- =====================================================
-- FIX DEFINITIVO: message_requests em falta + correção
-- de sintaxe SQL inválida da migration anterior
-- (BEGIN/EXCEPTION fora de bloco DO não é válido em SQL puro
-- e provavelmente falhou ao correr em 20260619110000)
-- =====================================================

-- 1. CRIAR message_requests (usada no código mas nunca criada)
CREATE TABLE IF NOT EXISTS public.message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preview_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);

GRANT SELECT, INSERT, UPDATE ON public.message_requests TO authenticated;
GRANT ALL ON public.message_requests TO service_role;
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mr select own" ON public.message_requests;
CREATE POLICY "mr select own" ON public.message_requests FOR SELECT TO authenticated USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
);

DROP POLICY IF EXISTS "mr insert own" ON public.message_requests;
CREATE POLICY "mr insert own" ON public.message_requests FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id
);

DROP POLICY IF EXISTS "mr update receiver" ON public.message_requests;
CREATE POLICY "mr update receiver" ON public.message_requests FOR UPDATE TO authenticated USING (
  auth.uid() = receiver_id
) WITH CHECK (
  auth.uid() = receiver_id
);

CREATE INDEX IF NOT EXISTS idx_message_requests_receiver ON public.message_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_message_requests_sender ON public.message_requests(sender_id);

-- 2. Quando um pedido é aprovado, cria automaticamente a conversa
--    (assim o frontend não precisa de duplicar essa lógica)
CREATE OR REPLACE FUNCTION public.handle_message_request_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id uuid;
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    SELECT cp1.conversation_id INTO conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = NEW.sender_id AND cp2.user_id = NEW.receiver_id
    LIMIT 1;

    IF conv_id IS NULL THEN
      INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO conv_id;
      INSERT INTO public.conversation_participants (conversation_id, user_id)
      VALUES (conv_id, NEW.sender_id), (conv_id, NEW.receiver_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_request_approved ON public.message_requests;
CREATE TRIGGER on_message_request_approved
  AFTER UPDATE ON public.message_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_message_request_approved();

-- 3. Reaplicar fixes de RLS/realtime da migration anterior,
--    desta vez com sintaxe válida (DO $$ ... $$ em vez de BEGIN solto)
DROP POLICY IF EXISTS "profiles_search" ON public.profiles;
CREATE POLICY "profiles_search" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cp insert" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp insert own or partner" ON public.conversation_participants;
CREATE POLICY "cp insert own or partner" ON public.conversation_participants FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "cp read own" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp read own or shared" ON public.conversation_participants;
CREATE POLICY "cp read own or shared" ON public.conversation_participants FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = conversation_participants.conversation_id
    AND cp2.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "conv insert" ON public.conversations;
DROP POLICY IF EXISTS "conv insert auth" ON public.conversations;
CREATE POLICY "conv insert auth" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "msg insert own" ON public.messages;
DROP POLICY IF EXISTS "msg insert own strict" ON public.messages;
CREATE POLICY "msg insert own strict" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = messages.conversation_id
    AND user_id = auth.uid()
  )
);

-- Realtime: sintaxe correta usando DO $$ com tratamento de exceção
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id
  ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id
  ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username
  ON public.profiles(LOWER(username));
