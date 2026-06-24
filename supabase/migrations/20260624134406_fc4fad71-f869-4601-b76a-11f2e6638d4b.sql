
DROP POLICY IF EXISTS "msg_insert" ON public.messages;
CREATE POLICY "msg_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      JOIN public.blocked_users b ON b.blocker_id = cp.user_id AND b.blocked_id = auth.uid()
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id <> auth.uid()
    )
  );
