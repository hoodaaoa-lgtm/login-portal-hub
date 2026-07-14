-- ═══════════════════════════════════════════════════════════════════════
-- SISTEMA DE REDES (comunidades) — Baya
--
-- Não cria um sistema paralelo de publicações/comentários/mensagens:
--   • Publicações de uma Rede continuam a viver em `posts` (mesma tabela,
--     mesmo PostCard universal) — só ganham um vínculo `rede_id`.
--   • A conversa de uma Rede é uma `conversations` normal, com todos os
--     membros em `conversation_participants` — mesmas tabelas/mensagens
--     do sistema de mensagens atual.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Tabela principal ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.redes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username       text UNIQUE NOT NULL,
  nome           text NOT NULL,
  avatar_url     text,
  capa_url       text,
  categoria      text,
  tipo           text NOT NULL DEFAULT 'publica' CHECK (tipo IN ('publica','privada','canal')),
  tem_chat       boolean NOT NULL DEFAULT true,
  descricao      text,
  regras         text,
  quem_publica   text NOT NULL DEFAULT 'todos' CHECK (quem_publica IN ('todos','admins')),
  quem_comenta   text NOT NULL DEFAULT 'todos' CHECK (quem_comenta IN ('todos','membros','admins')),
  criador_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  membros_count  integer NOT NULL DEFAULT 0,
  verificada     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redes_username ON public.redes (username);
CREATE INDEX IF NOT EXISTS idx_redes_tipo ON public.redes (tipo);

-- ─── Membros ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rede_membros (
  rede_id     uuid NOT NULL REFERENCES public.redes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  papel       text NOT NULL DEFAULT 'membro' CHECK (papel IN ('admin','moderador','membro')),
  estado      text NOT NULL DEFAULT 'ativo' CHECK (estado IN ('ativo','pendente')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rede_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rede_membros_user ON public.rede_membros (user_id);

-- ─── Vínculo das publicações a uma Rede (sem duplicar `posts`) ─────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS rede_id uuid REFERENCES public.redes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rede_nome text,
  ADD COLUMN IF NOT EXISTS rede_username text,
  ADD COLUMN IF NOT EXISTS rede_avatar_url text,
  ADD COLUMN IF NOT EXISTS rede_verificada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_posts_rede_id ON public.posts (rede_id);

-- ─── Vínculo da conversa de uma Rede (mesma tabela `conversations`) ────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS rede_id uuid REFERENCES public.redes(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_rede_id ON public.conversations (rede_id) WHERE rede_id IS NOT NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.redes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rede_membros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS redes_select ON public.redes;
CREATE POLICY redes_select ON public.redes FOR SELECT TO authenticated
  USING (
    tipo = 'publica'
    OR criador_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.rede_membros m WHERE m.rede_id = redes.id AND m.user_id = auth.uid() AND m.estado = 'ativo')
  );

DROP POLICY IF EXISTS redes_insert ON public.redes;
CREATE POLICY redes_insert ON public.redes FOR INSERT TO authenticated
  WITH CHECK (criador_id = auth.uid());

DROP POLICY IF EXISTS redes_update ON public.redes;
CREATE POLICY redes_update ON public.redes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rede_membros m WHERE m.rede_id = redes.id AND m.user_id = auth.uid() AND m.papel = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rede_membros m WHERE m.rede_id = redes.id AND m.user_id = auth.uid() AND m.papel = 'admin'));

DROP POLICY IF EXISTS rede_membros_select ON public.rede_membros;
CREATE POLICY rede_membros_select ON public.rede_membros FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.redes r WHERE r.id = rede_membros.rede_id AND (r.tipo = 'publica' OR r.criador_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.rede_membros m2 WHERE m2.rede_id = rede_membros.rede_id AND m2.user_id = auth.uid() AND m2.estado = 'ativo')
  );

DROP POLICY IF EXISTS rede_membros_delete ON public.rede_membros;
CREATE POLICY rede_membros_delete ON public.rede_membros FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.rede_membros m2 WHERE m2.rede_id = rede_membros.rede_id AND m2.user_id = auth.uid() AND m2.papel = 'admin')
  );

-- (INSERT/UPDATE em rede_membros só via RPC's SECURITY DEFINER abaixo,
-- por isso não há policy de insert/update directa para authenticated.)

-- ─── Trigger: manter membros_count sincronizado ────────────────────────
CREATE OR REPLACE FUNCTION public.rede_sync_membros_count() RETURNS trigger AS $$
BEGIN
  UPDATE public.redes SET membros_count = (
    SELECT count(*) FROM public.rede_membros WHERE rede_id = COALESCE(NEW.rede_id, OLD.rede_id) AND estado = 'ativo'
  ) WHERE id = COALESCE(NEW.rede_id, OLD.rede_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_rede_membros_count ON public.rede_membros;
CREATE TRIGGER trg_rede_membros_count
AFTER INSERT OR UPDATE OR DELETE ON public.rede_membros
FOR EACH ROW EXECUTE FUNCTION public.rede_sync_membros_count();

-- ─── RPC: criar_rede ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rede_criar(
  p_username text, p_nome text, p_avatar_url text, p_categoria text,
  p_tipo text, p_tem_chat boolean
) RETURNS public.redes AS $$
DECLARE
  v_rede public.redes;
  v_conv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF p_tem_chat THEN
    INSERT INTO public.conversations (is_official, reply_allowed) VALUES (false, true) RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO public.redes (username, nome, avatar_url, categoria, tipo, tem_chat, criador_id, conversation_id, verificada)
  VALUES (lower(p_username), p_nome, p_avatar_url, p_categoria, p_tipo, p_tem_chat, auth.uid(), v_conv_id, false)
  RETURNING * INTO v_rede;

  INSERT INTO public.rede_membros (rede_id, user_id, papel, estado) VALUES (v_rede.id, auth.uid(), 'admin', 'ativo');

  IF v_conv_id IS NOT NULL THEN
    UPDATE public.conversations SET rede_id = v_rede.id WHERE id = v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_conv_id, auth.uid());
  END IF;

  RETURN v_rede;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rede_criar(text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rede_criar(text, text, text, text, text, boolean) TO authenticated;

-- ─── RPC: entrar_rede ───────────────────────────────────────────────────
-- Devolve 'ativo' (entrou logo), 'pendente' (aguarda aprovação, Rede privada)
CREATE OR REPLACE FUNCTION public.rede_entrar(p_rede_id uuid) RETURNS text AS $$
DECLARE
  v_tipo text; v_conv_id uuid; v_estado text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT tipo, conversation_id INTO v_tipo, v_conv_id FROM public.redes WHERE id = p_rede_id;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'Rede não encontrada'; END IF;

  v_estado := CASE WHEN v_tipo = 'privada' THEN 'pendente' ELSE 'ativo' END;

  INSERT INTO public.rede_membros (rede_id, user_id, papel, estado)
  VALUES (p_rede_id, auth.uid(), 'membro', v_estado)
  ON CONFLICT (rede_id, user_id) DO NOTHING;

  IF v_estado = 'ativo' AND v_conv_id IS NOT NULL THEN
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, auth.uid()) ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_estado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rede_entrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rede_entrar(uuid) TO authenticated;

-- ─── RPC: sair_rede ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rede_sair(p_rede_id uuid) RETURNS void AS $$
DECLARE v_conv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT conversation_id INTO v_conv_id FROM public.redes WHERE id = p_rede_id;
  DELETE FROM public.rede_membros WHERE rede_id = p_rede_id AND user_id = auth.uid();
  IF v_conv_id IS NOT NULL THEN
    DELETE FROM public.conversation_participants WHERE conversation_id = v_conv_id AND user_id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rede_sair(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rede_sair(uuid) TO authenticated;

-- ─── RPC: aprovar/recusar membro (Rede privada) ────────────────────────
CREATE OR REPLACE FUNCTION public.rede_aprovar_membro(p_rede_id uuid, p_user_id uuid, p_aprovar boolean) RETURNS void AS $$
DECLARE v_conv_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rede_membros WHERE rede_id = p_rede_id AND user_id = auth.uid() AND papel = 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_aprovar THEN
    UPDATE public.rede_membros SET estado = 'ativo' WHERE rede_id = p_rede_id AND user_id = p_user_id;
    SELECT conversation_id INTO v_conv_id FROM public.redes WHERE id = p_rede_id;
    IF v_conv_id IS NOT NULL THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_conv_id, p_user_id) ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    DELETE FROM public.rede_membros WHERE rede_id = p_rede_id AND user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rede_aprovar_membro(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rede_aprovar_membro(uuid, uuid, boolean) TO authenticated;

-- ─── RPC: minhas redes (para o topo do feed, com novidades por ver) ────
CREATE OR REPLACE FUNCTION public.rede_minhas() RETURNS TABLE (
  id uuid, username text, nome text, avatar_url text, verificada boolean, novidades bigint
) AS $$
  SELECT r.id, r.username, r.nome, r.avatar_url, r.verificada,
    (SELECT count(*) FROM public.posts p WHERE p.rede_id = r.id AND p.created_at > m.last_seen_at) AS novidades
  FROM public.redes r
  JOIN public.rede_membros m ON m.rede_id = r.id AND m.user_id = auth.uid() AND m.estado = 'ativo'
  ORDER BY novidades DESC, r.nome ASC;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

REVOKE ALL ON FUNCTION public.rede_minhas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rede_minhas() TO authenticated;

-- ─── RPC: marcar Rede como vista (zera o círculo vermelho) ─────────────
CREATE OR REPLACE FUNCTION public.rede_marcar_vista(p_rede_id uuid) RETURNS void AS $$
  UPDATE public.rede_membros SET last_seen_at = now() WHERE rede_id = p_rede_id AND user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rede_marcar_vista(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rede_marcar_vista(uuid) TO authenticated;
