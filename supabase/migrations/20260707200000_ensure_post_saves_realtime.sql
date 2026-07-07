-- ═══════════════════════════════════════════════════════════════════════
-- Garante Realtime + RLS de leitura em "post_saves" (guardados), para que
-- o estado de "guardado" fique sincronizado em tempo real entre todos os
-- dispositivos/abas, tal como já acontece com follows/likes/comentários.
-- Idempotente — seguro correr mesmo que já tenha sido aplicado.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.post_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_saves_select_own" ON public.post_saves;
CREATE POLICY "post_saves_select_own" ON public.post_saves
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_saves_insert_own" ON public.post_saves;
CREATE POLICY "post_saves_insert_own" ON public.post_saves
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_saves_delete_own" ON public.post_saves;
CREATE POLICY "post_saves_delete_own" ON public.post_saves
  FOR DELETE USING (auth.uid() = user_id);

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.post_saves; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

COMMIT;
