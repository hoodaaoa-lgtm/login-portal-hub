-- ───────────────────────────────────────────────────────────────────────
-- Corrige 42501 "permission denied for table profiles" ao carregar o
-- perfil (perfil.tsx faz SELECT incluindo username_changed_at).
--
-- Causa: a tabela public.profiles usa GRANTs por coluna desde
-- 20260627085510_..._fac44c8c...sql (REVOKE SELECT ON public.profiles
-- FROM anon, authenticated). A coluna username_changed_at foi criada
-- depois, em 20260629000000_username_cooldown.sql, mas nenhuma migração
-- concedeu SELECT sobre ela — qualquer query que a inclua no select()
-- falha para toda a linha (403 Forbidden / 42501), não só para essa
-- coluna.
--
-- Correção: concede SELECT (username_changed_at) a authenticated.
-- Só o dono do perfil precisa disto (regra de cooldown do próprio
-- username), por isso não é concedido a anon.
-- Idempotente.
-- ───────────────────────────────────────────────────────────────────────

GRANT SELECT (username_changed_at) ON public.profiles TO authenticated;
