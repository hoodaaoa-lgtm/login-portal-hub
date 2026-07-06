-- =====================================================
-- MESSAGING SYSTEM FIX - COMPLETE
-- =====================================================

-- 1. FIX: profiles RLS — permitir pesquisa pública por username
DROP POLICY IF EXISTS "profiles_search" ON public.profiles;
CREATE POLICY "profiles_search" ON public.profiles FOR SELECT TO authenticated USING (true);

-- 2. FIX: conversation_participants — validação rigorosa
DROP POLICY IF EXISTS "cp insert" ON public.conversation_participants;
CREATE POLICY "cp insert own or partner" ON public.conversation_participants FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "cp read own" ON public.conversation_participants;
CREATE POLICY "cp read own or shared" ON public.conversation_participants FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = conversation_participants.conversation_id
    AND cp2.user_id = auth.uid()
  )
);

-- 3. FIX: conversations — confirma RLS correta
DROP POLICY IF EXISTS "conv insert" ON public.conversations;
CREATE POLICY "conv insert auth" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);

-- 4. FIX: messages — validação de participação
DROP POLICY IF EXISTS "msg insert own" ON public.messages;
CREATE POLICY "msg insert own strict" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = messages.conversation_id
    AND user_id = auth.uid()
  )
);

-- 5. REALTIME — força a adição de tabelas críticas
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 6. INDICES para performance
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

-- 7. Confirma que as tabelas têm tipos correctos
ALTER TABLE public.profiles ALTER COLUMN username TYPE text;
ALTER TABLE public.profiles ALTER COLUMN full_name TYPE text;
