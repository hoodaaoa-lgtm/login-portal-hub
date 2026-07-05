-- Corrige de forma definitiva o botão "Seguir": estava a dar 403 (Forbidden) ao
-- ler a tabela follows e 409 (Conflict) ao tentar seguir alguém que já constava
-- na tabela (por a leitura falhar, o app não sabia que já seguia e tentava
-- inserir outra vez, batendo na chave primária composta follower_id+target_username).

BEGIN;

-- Garante que RLS está ativo
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Recria as políticas de forma limpa (idempotente)
DROP POLICY IF EXISTS "follows read" ON public.follows;
DROP POLICY IF EXISTS "follows insert own" ON public.follows;
DROP POLICY IF EXISTS "follows delete own" ON public.follows;

CREATE POLICY "follows read" ON public.follows
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "follows insert own" ON public.follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows delete own" ON public.follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- Reforça os grants a nível de tabela (idempotente, não faz mal repetir)
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;

COMMIT;
