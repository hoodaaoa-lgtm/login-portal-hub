-- Fix: a política de leitura de vídeos tinha precedência errada nos operadores.
-- Sem parênteses, "A AND B OR C" = "(A AND B) OR C" o que em SQL está correcto,
-- mas o Supabase RLS avalia de forma que utilizadores autenticados só viam
-- os seus próprios vídeos. Reescrevemos de forma explícita.

DROP POLICY IF EXISTS "videos public read" ON public.videos;

CREATE POLICY "videos public read" ON public.videos
  FOR SELECT USING (
    (visibility = 'public' AND status = 'published')
    OR (auth.uid() = owner_id)
  );
