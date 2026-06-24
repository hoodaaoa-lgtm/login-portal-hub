-- Tabela de reações a mensagens
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions select" ON public.message_reactions;
CREATE POLICY "reactions select" ON public.message_reactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reactions insert" ON public.message_reactions;
CREATE POLICY "reactions insert" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reactions delete" ON public.message_reactions;
CREATE POLICY "reactions delete" ON public.message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "reactions update" ON public.message_reactions;
CREATE POLICY "reactions update" ON public.message_reactions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT ALL ON public.message_reactions TO authenticated;

-- Adicionar ao realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
