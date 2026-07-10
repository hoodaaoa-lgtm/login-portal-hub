-- ═══════════════════════════════════════════════════════════════════════
-- FIX: get_hooda_official_id ficou sem permissão de execução.
-- ---------------------------------------------------------------------
-- A migração 20260707203131 revogou EXECUTE de um lote de funções
-- "internas" (admin_delete_account, apply_content_moderation, etc.) para
-- authenticated/anon/PUBLIC — e incluiu get_hooda_official_id nesse lote
-- por engano. Esta função só devolve o ID da conta "Hooda Oficial" (sem
-- dados sensíveis) e É suposto ser chamada a partir do browser: é assim
-- que a app exclui essa conta das sugestões de seguir e da pesquisa.
--
-- Resultado do bug: 403 Forbidden em todas as chamadas a
-- get_hooda_official_id (visível na consola), e a conta oficial passou a
-- poder aparecer em sugestões/pesquisa como qualquer outro utilizador.
--
-- Corre este ficheiro inteiro no SQL Editor do Supabase. É idempotente.
-- ═══════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.get_hooda_official_id() TO authenticated, anon;
