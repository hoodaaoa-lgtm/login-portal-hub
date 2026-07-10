-- ============================================================================
-- A password do painel de admin ("141819") estava escrita em texto simples
-- no código React (hdequipa9x2.tsx) — qualquer pessoa conseguia lê-la
-- inspecionando o JavaScript do site no navegador, mesmo sem ser admin.
--
-- As ações reais do painel (banir, verificar, etc.) já estão protegidas a
-- sério por RLS + trigger (ver 20260706000000_admin_moderation.sql) e exigem
-- is_hooda_admin() = true. Esta password era só um "ecrã de bloqueio" extra
-- para o próprio admin — mas, exposta no código, deixava de proteger seja o
-- que for.
--
-- Esta migration move a comparação para dentro do Postgres, por trás de
-- is_hooda_admin(): o valor real nunca mais é enviado ao browser.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_pin (
  id       boolean PRIMARY KEY DEFAULT true CHECK (id),
  pin_hash text NOT NULL
);

-- Semeia o PIN atual (troca "141819" por outro valor à tua escolha antes de
-- correr, se quiseres um PIN novo).
INSERT INTO public.admin_pin (id, pin_hash)
VALUES (true, crypt('141819', gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_pin ENABLE ROW LEVEL SECURITY;
-- Ninguém lê/escreve esta tabela diretamente — só a função abaixo (SECURITY
-- DEFINER) lhe acede. Nenhuma policy = nenhum acesso via API/cliente.

CREATE OR REPLACE FUNCTION public.verify_admin_pin(candidate text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admin_pin WHERE pin_hash = crypt(candidate, pin_hash)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_admin_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(text) TO authenticated;

-- Função para trocar o PIN mais tarde (ex.: correr no SQL Editor):
--   SELECT public.set_admin_pin('novo_pin_aqui');
CREATE OR REPLACE FUNCTION public.set_admin_pin(new_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem trocar o PIN.';
  END IF;
  UPDATE public.admin_pin SET pin_hash = crypt(new_pin, gen_salt('bf')) WHERE id = true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_admin_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin_pin(text) TO authenticated;

-- Fim.
