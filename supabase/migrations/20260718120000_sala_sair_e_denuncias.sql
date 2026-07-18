-- ───────────────────────────────────────────────────────────────────────
-- Sair da sala + suporte a denúncias de salas (usado pelo novo modal de
-- info da sala, aberto pela engrenagem no cabeçalho do SalaPanel).
-- Corre este ficheiro inteiro no Supabase SQL Editor. É seguro correr mais
-- que uma vez.
-- ───────────────────────────────────────────────────────────────────────

-- ── Sair de uma Sala ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sala_sair(p_sala_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id  uuid;
  v_criador  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário sessão iniciada.';
  END IF;

  SELECT conversation_id, criador_id INTO v_conv_id, v_criador
    FROM public.salas WHERE id = p_sala_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'Sala não encontrada.';
  END IF;

  IF v_criador = auth.uid() THEN
    RAISE EXCEPTION 'O criador não pode sair da própria sala.';
  END IF;

  DELETE FROM public.sala_membros WHERE sala_id = p_sala_id AND user_id = auth.uid();
  DELETE FROM public.conversation_participants WHERE conversation_id = v_conv_id AND user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sala_sair(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sala_sair(uuid) TO authenticated;

-- ── Tabela genérica de denúncias (perfis e, agora, salas) ──────────────
-- Já usada por src/routes/u.$username.tsx (kind:"profile"); aqui garantimos
-- que existe e adicionamos a coluna para denúncias de sala.
CREATE TABLE IF NOT EXISTS public.reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reason            text NOT NULL,
  kind              text NOT NULL DEFAULT 'profile',
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','dismissed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS reported_sala_id uuid REFERENCES public.salas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reports_reported_sala ON public.reports(reported_sala_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.is_hooda_admin());

DROP POLICY IF EXISTS "reports_admin_update" ON public.reports;
CREATE POLICY "reports_admin_update" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.is_hooda_admin())
  WITH CHECK (public.is_hooda_admin());

-- Fim.
