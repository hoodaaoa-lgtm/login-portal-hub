-- Adicionar blocked_users à publicação do realtime (necessário para postgres_changes)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_users;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Garantir que muted_conversations também está
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.muted_conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
