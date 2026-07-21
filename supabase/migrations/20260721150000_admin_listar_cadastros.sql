-- ───────────────────────────────────────────────────────────────────────
-- Painel admin: lista de cadastros com nome do canal, categorias e se
-- o Gmail já foi verificado. O e-mail e a data de confirmação vivem em
-- auth.users, que o cliente não pode consultar diretamente — por isso
-- esta função (SECURITY DEFINER, só para admins) devolve tudo já
-- combinado com public.profiles.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_listar_cadastros()
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  categorias text[],
  email text,
  gmail_confirmado boolean,
  is_verified boolean,
  is_banned boolean,
  ban_reason text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem ver esta lista.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.full_name,
    p.categorias,
    u.email,
    (u.email_confirmed_at IS NOT NULL) AS gmail_confirmado,
    p.is_verified,
    p.is_banned,
    p.ban_reason,
    p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_listar_cadastros() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_cadastros() TO authenticated;
