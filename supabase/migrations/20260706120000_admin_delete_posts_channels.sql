-- ============================================================================
-- Moderação do Admin: eliminar qualquer publicação e qualquer canal
-- Depende de public.is_hooda_admin(), criada em 20260705000000_official_admin_messages.sql
-- Corre este ficheiro inteiro no Supabase SQL Editor. É seguro correr mais que uma vez.
-- ============================================================================

-- 1) Admin pode eliminar qualquer publicação (a política existente só
--    deixa o autor eliminar a própria publicação).
DROP POLICY IF EXISTS "admin delete any post" ON public.posts;
CREATE POLICY "admin delete any post" ON public.posts
  FOR DELETE TO authenticated
  USING ( public.is_hooda_admin() );

-- 2) Admin pode eliminar qualquer canal (a política existente só deixa o
--    dono eliminar o próprio canal).
DROP POLICY IF EXISTS "admin delete any channel" ON public.channels;
CREATE POLICY "admin delete any channel" ON public.channels
  FOR DELETE TO authenticated
  USING ( public.is_hooda_admin() );

-- Fim.
