-- ============================================================================
-- Corrige contagem de seguidores/a-seguir sempre a 0 em toda a plataforma
-- ----------------------------------------------------------------------------
-- A migração 20260706081831 removeu a política "follows read" (SELECT
-- USING (true)) com o comentário "drop the wide-open SELECT policy, keep
-- the scoped one" — mas nunca chegou a criar nenhuma política "scoped"
-- para a substituir. Como RLS está ativo em public.follows, isso deixou a
-- tabela SEM NENHUMA política de SELECT: toda a leitura passou a devolver
-- 0 linhas para qualquer utilizador (mesmo para as suas próprias
-- relações de seguir).
--
-- Impacto: contagem de "Seguidores"/"A seguir" no menu, no perfil, no
-- botão "Seguir"/"A seguir ✓" do feed, e nas sugestões "Quem seguir" —
-- tudo isto lê public.follows e ficou sempre a mostrar 0 / desatualizado.
--
-- Follows são informação pública em qualquer rede social (tal como
-- acontece em profiles, posts, channels — todos com SELECT USING(true)),
-- por isso repomos leitura pública para autenticados.
--
-- Corre este ficheiro inteiro no Supabase SQL Editor. É seguro correr mais
-- que uma vez (idempotente).
-- ============================================================================

DROP POLICY IF EXISTS "follows read" ON public.follows;
DROP POLICY IF EXISTS "follows read public" ON public.follows;

CREATE POLICY "follows read public" ON public.follows
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.follows TO authenticated;
