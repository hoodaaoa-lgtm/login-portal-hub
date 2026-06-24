
-- Allow blocked user to see the row that blocks them (needed for realtime delivery)
CREATE POLICY "blocked_can_see_own_block"
  ON public.blocked_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = blocked_id);

-- Ensure DELETE events carry full row identity (so unblock notifies the other side)
ALTER TABLE public.blocked_users REPLICA IDENTITY FULL;
ALTER TABLE public.follows REPLICA IDENTITY FULL;

-- Add to realtime publication (idempotent)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_users;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.videos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
