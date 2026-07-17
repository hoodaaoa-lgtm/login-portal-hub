-- ───────────────────────────────────────────────────────────────────────
-- Gestão de Salas: permissões de envio, banimento e promoção a admin
-- ───────────────────────────────────────────────────────────────────────

-- Permite ao admin controlar, por membro, se pode ou não enviar mensagens
ALTER TABLE public.sala_membros
  ADD COLUMN IF NOT EXISTS pode_enviar boolean NOT NULL DEFAULT true;

-- Define quem pode escrever na sala: 'todos' ou apenas 'selecionados' (via pode_enviar)
ALTER TABLE public.salas
  ADD COLUMN IF NOT EXISTS quem_pode_escrever text NOT NULL DEFAULT 'todos'
  CHECK (quem_pode_escrever IN ('todos','selecionados'));

-- Lista de utilizadores banidos de uma sala (impede reentrada)
CREATE TABLE IF NOT EXISTS public.sala_banidos (
  sala_id     uuid NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  banido_por  uuid NOT NULL REFERENCES public.profiles(id),
  banido_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sala_id, user_id)
);

ALTER TABLE public.sala_banidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sala_banidos_select_admin" ON public.sala_banidos;
CREATE POLICY "sala_banidos_select_admin" ON public.sala_banidos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sala_membros sm
      WHERE sm.sala_id = sala_banidos.sala_id AND sm.user_id = auth.uid() AND sm.papel = 'admin'
    )
    OR EXISTS (SELECT 1 FROM public.salas s WHERE s.id = sala_banidos.sala_id AND s.criador_id = auth.uid())
  );

-- ── Helper: é admin ou dono desta sala? ────────────────────────────────
CREATE OR REPLACE FUNCTION public.sala_is_admin(p_sala_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.salas s WHERE s.id = p_sala_id AND s.criador_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.sala_membros sm WHERE sm.sala_id = p_sala_id AND sm.user_id = p_user_id AND sm.papel = 'admin'
  );
$$;

-- ── Entrar numa Sala (agora bloqueia utilizadores banidos) ─────────────
CREATE OR REPLACE FUNCTION public.sala_entrar(p_sala_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário sessão iniciada.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sala_banidos WHERE sala_id = p_sala_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Foste removido desta sala e não podes voltar a entrar.';
  END IF;

  SELECT conversation_id INTO v_conv_id FROM public.salas WHERE id = p_sala_id;
  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'Sala não encontrada.';
  END IF;

  INSERT INTO public.sala_membros (sala_id, user_id, papel)
    VALUES (p_sala_id, auth.uid(), 'membro')
    ON CONFLICT (sala_id, user_id) DO NOTHING;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, auth.uid())
    ON CONFLICT DO NOTHING;
END;
$$;

-- ── Promover / despromover admin ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sala_definir_papel(p_sala_id uuid, p_user_id uuid, p_papel text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.sala_is_admin(p_sala_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar cargos.';
  END IF;
  IF p_papel NOT IN ('admin','membro') THEN
    RAISE EXCEPTION 'Cargo inválido.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.salas WHERE id = p_sala_id AND criador_id = p_user_id) THEN
    RAISE EXCEPTION 'O dono da sala não pode ser alterado.';
  END IF;

  UPDATE public.sala_membros SET papel = p_papel WHERE sala_id = p_sala_id AND user_id = p_user_id;
END;
$$;

-- ── Permitir / bloquear envio de mensagens de um membro ─────────────────
CREATE OR REPLACE FUNCTION public.sala_definir_permissao_envio(p_sala_id uuid, p_user_id uuid, p_pode_enviar boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.sala_is_admin(p_sala_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar permissões.';
  END IF;

  UPDATE public.sala_membros SET pode_enviar = p_pode_enviar WHERE sala_id = p_sala_id AND user_id = p_user_id;
END;
$$;

-- ── Banir membro ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sala_banir(p_sala_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  IF NOT public.sala_is_admin(p_sala_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem banir membros.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.salas WHERE id = p_sala_id AND criador_id = p_user_id) THEN
    RAISE EXCEPTION 'O dono da sala não pode ser banido.';
  END IF;

  SELECT conversation_id INTO v_conv_id FROM public.salas WHERE id = p_sala_id;

  DELETE FROM public.sala_membros WHERE sala_id = p_sala_id AND user_id = p_user_id;
  IF v_conv_id IS NOT NULL THEN
    DELETE FROM public.conversation_participants WHERE conversation_id = v_conv_id AND user_id = p_user_id;
  END IF;

  INSERT INTO public.sala_banidos (sala_id, user_id, banido_por)
    VALUES (p_sala_id, p_user_id, auth.uid())
    ON CONFLICT (sala_id, user_id) DO NOTHING;
END;
$$;

-- ── Desbanir membro ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sala_desbanir(p_sala_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.sala_is_admin(p_sala_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem desbanir membros.';
  END IF;
  DELETE FROM public.sala_banidos WHERE sala_id = p_sala_id AND user_id = p_user_id;
END;
$$;

-- ── Definir quem pode escrever na sala (todos / apenas selecionados) ───
CREATE OR REPLACE FUNCTION public.sala_definir_quem_pode_escrever(p_sala_id uuid, p_modo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.sala_is_admin(p_sala_id, auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar esta definição.';
  END IF;
  IF p_modo NOT IN ('todos','selecionados') THEN
    RAISE EXCEPTION 'Modo inválido.';
  END IF;

  UPDATE public.salas SET quem_pode_escrever = p_modo WHERE id = p_sala_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sala_definir_quem_pode_escrever(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sala_definir_quem_pode_escrever(uuid,text) TO authenticated;

-- ── Realtime: garantir que updates em salas e sala_membros propagam ────
-- (necessário para refletir mudanças de permissões/cargos ao vivo, sem reload)
ALTER TABLE public.salas REPLICA IDENTITY FULL;
ALTER TABLE public.sala_membros REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'salas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salas;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sala_membros'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sala_membros;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.sala_definir_papel(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sala_definir_permissao_envio(uuid,uuid,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sala_banir(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sala_desbanir(uuid,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sala_definir_papel(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sala_definir_permissao_envio(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sala_banir(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sala_desbanir(uuid,uuid) TO authenticated;
