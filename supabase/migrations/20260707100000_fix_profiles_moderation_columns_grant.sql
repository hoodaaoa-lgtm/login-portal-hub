-- ============================================================================
-- Corrige permissões em falta nas colunas de moderação do admin
-- ----------------------------------------------------------------------------
-- A migração 20260627085510 trocou o GRANT SELECT em public.profiles de
-- "todas as colunas" para uma lista explícita de colunas (boa prática de
-- segurança, para nunca expor colunas sensíveis por acidente). Mas essa
-- lista foi escrita ANTES de is_banned/ban_reason/is_verified existirem
-- (adicionadas só depois, em 20260706000000_admin_moderation.sql).
--
-- Resultado: qualquer query que peça essas 3 colunas — ou select("*"), que
-- as inclui implicitamente — falha com "permission denied for column", e
-- no cliente (supabase-js) esse erro fica em `.error`, não lança exceção.
-- Isto fazia o dashboard do admin mostrar sempre 0 utilizadores (a contagem
-- pedia select("*")) e a lista de denúncias/utilizadores nunca mostrar
-- corretamente o estado de banimento/verificação.
--
-- Corre este ficheiro inteiro no Supabase SQL Editor. É seguro correr mais
-- que uma vez (idempotente).
-- ============================================================================

GRANT SELECT (is_banned, ban_reason, is_verified) ON public.profiles TO authenticated;

-- is_verified é um selo público (aparece ao lado do nome, igual ao "Hooda
-- Oficial") — também precisa de ser visível para visitantes não autenticados.
GRANT SELECT (is_verified) ON public.profiles TO anon;
