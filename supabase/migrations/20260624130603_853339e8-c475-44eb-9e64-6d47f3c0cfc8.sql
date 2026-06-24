
-- Fix infinite recursion on conversation_participants SELECT policy
-- by using a SECURITY DEFINER helper that bypasses RLS for the lookup.

CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated, anon, service_role;

-- conversation_participants
DROP POLICY IF EXISTS "cp read own" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp insert" ON public.conversation_participants;

CREATE POLICY "cp read own"
ON public.conversation_participants
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_conversation_participant(conversation_id, auth.uid())
);

CREATE POLICY "cp insert"
ON public.conversation_participants
FOR INSERT TO authenticated
WITH CHECK (true);

-- conversations
DROP POLICY IF EXISTS "conv read participants" ON public.conversations;
CREATE POLICY "conv read participants"
ON public.conversations
FOR SELECT TO authenticated
USING (public.is_conversation_participant(id, auth.uid()));

-- messages
DROP POLICY IF EXISTS "msg_select" ON public.messages;
DROP POLICY IF EXISTS "msg_insert" ON public.messages;
DROP POLICY IF EXISTS "msg_update" ON public.messages;

CREATE POLICY "msg_select"
ON public.messages
FOR SELECT TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "msg_insert"
ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

CREATE POLICY "msg_update"
ON public.messages
FOR UPDATE TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()))
WITH CHECK (public.is_conversation_participant(conversation_id, auth.uid()));
