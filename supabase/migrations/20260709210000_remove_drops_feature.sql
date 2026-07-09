-- ═══════════════════════════════════════════════════════════════════════
-- Remove por completo a feature "Drops"/"Gotas".
-- ---------------------------------------------------------------------
-- O código do lado da app (rota /drops, DropsCreator, item de navegação
-- "Gotas", ação rápida "Drop" no composer) já foi removido nesta mesma
-- sessão. Este ficheiro remove o que sobra do lado da base de dados:
-- as tabelas, os triggers e as funções criadas em
-- 20260703180000_drops.sql.
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É seguro correr
-- mais que uma vez (idempotente) — todos os DROP usam IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Tabelas dependentes primeiro (interações e comentários), depois a
--    tabela principal. CASCADE remove também os índices, policies e
--    triggers associados a cada tabela.
DROP TABLE IF EXISTS public.drop_interactions CASCADE;
DROP TABLE IF EXISTS public.drop_comments CASCADE;
DROP TABLE IF EXISTS public.drops CASCADE;

-- 2) Funções auxiliares (os triggers já desapareceram junto com as
--    tabelas acima, mas as funções ficam órfãs até serem removidas
--    explicitamente).
DROP FUNCTION IF EXISTS public.set_drop_defaults();
DROP FUNCTION IF EXISTS public.drop_interaction_count();
DROP FUNCTION IF EXISTS public.drop_comment_count();
DROP FUNCTION IF EXISTS public.cleanup_expired_drops();
