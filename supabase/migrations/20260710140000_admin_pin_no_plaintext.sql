-- ============================================================================
-- A migration anterior (20260710130000_admin_pin_server_side.sql) semeou o
-- PIN "141819" em texto simples no próprio ficheiro SQL. Isso resolveu o
-- problema do PIN aparecer no bundle JS do browser, mas criou um novo:
-- o valor em claro ficou gravado para sempre no histórico do Git/GitHub.
--
-- Esta migration troca o PIN por um valor aleatório de descarte (ninguém
-- o conhece, nem sequer nós) e o PIN real deve ser definido À MÃO no SQL
-- Editor do Supabase — nunca commitado no repositório.
--
-- Depois de correr esta migration, define o PIN real assim (fora do Git):
--   SELECT public.set_admin_pin('o-teu-novo-pin-aqui');
-- ============================================================================

-- Troca o PIN por um valor aleatório gerado pelo próprio Postgres — nem o
-- autor desta migration sabe qual é. Serve só para invalidar o "141819"
-- que estava exposto; o admin deve definir o PIN real logo a seguir.
UPDATE public.admin_pin
SET pin_hash = crypt(encode(gen_random_bytes(16), 'hex'), gen_salt('bf'))
WHERE id = true;

-- Fim. Lembrete: corre SELECT public.set_admin_pin('...'); no SQL Editor
-- do Supabase (não aqui, não no Git) para definires o PIN que vais usar.
