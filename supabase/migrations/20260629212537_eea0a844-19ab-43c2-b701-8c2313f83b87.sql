
CREATE TABLE IF NOT EXISTS public.conversation_key_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_public_key TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_key_shares TO authenticated;
GRANT ALL ON public.conversation_key_shares TO service_role;

ALTER TABLE public.conversation_key_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own key shares"
  ON public.conversation_key_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Allow a participant to insert key shares for any participant of the same conversation
-- (the sender distributes the shared AES key to both participants)
CREATE POLICY "participants insert key shares"
  ON public.conversation_key_shares FOR INSERT TO authenticated
  WITH CHECK (
    public.is_conversation_participant(conversation_id, auth.uid())
    AND public.is_conversation_participant(conversation_id, user_id)
  );

CREATE POLICY "participants update key shares"
  ON public.conversation_key_shares FOR UPDATE TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()))
  WITH CHECK (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "users delete own key shares"
  ON public.conversation_key_shares FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_conv_key_shares_user ON public.conversation_key_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_key_shares_conv ON public.conversation_key_shares(conversation_id);
