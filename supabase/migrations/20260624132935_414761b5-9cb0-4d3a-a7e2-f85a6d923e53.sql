
DROP POLICY IF EXISTS "conv insert" ON public.conversations;
CREATE POLICY "conv insert auth" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cp insert" ON public.conversation_participants;
CREATE POLICY "cp insert self" ON public.conversation_participants
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
