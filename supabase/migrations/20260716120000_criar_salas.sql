-- ───────────────────────────────────────────────────────────────────────
-- Sistema de Salas (grupos de conversa) — Snapper/Hooda
--
-- Uma Sala é um grupo de conversa: reutiliza a MESMA infraestrutura de
-- mensagens (tabelas `conversations`, `conversation_participants` e
-- `messages`) já usada em /mensagens, para poder reaproveitar o mesmo
-- envio de texto, fotos e vídeos, sem duplicar lógica.
--
-- Etapa atual: apenas criação e visualização básica.
-- Preparado para receber no futuro: cargos avançados e permissões
-- detalhadas.
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.salas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  descricao        text,
  foto_url         text,
  tipo             text NOT NULL DEFAULT 'publica' CHECK (tipo IN ('publica','privada','anuncios')),
  slug             text NOT NULL UNIQUE,
  criador_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  membros_count    integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salas_tipo ON public.salas(tipo);
CREATE INDEX IF NOT EXISTS idx_salas_criador ON public.salas(criador_id);

CREATE TABLE IF NOT EXISTS public.sala_membros (
  sala_id    uuid NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'admin' | 'membro' — estrutura preparada para futuros cargos (moderador, etc.)
  papel      text NOT NULL DEFAULT 'membro' CHECK (papel IN ('admin','membro')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sala_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sala_membros_user ON public.sala_membros(user_id);

ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sala_membros ENABLE ROW LEVEL SECURITY;

-- Qualquer utilizador autenticado pode ver a lista de salas (para poder
-- descobrir e entrar). A escrita direta é bloqueada — passa sempre pelas
-- funções abaixo (SECURITY DEFINER), que tratam a lógica corretamente.
DROP POLICY IF EXISTS "salas_select_all" ON public.salas;
CREATE POLICY "salas_select_all" ON public.salas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sala_membros_select_all" ON public.sala_membros;
CREATE POLICY "sala_membros_select_all" ON public.sala_membros FOR SELECT TO authenticated USING (true);

-- ── Mantém membros_count sincronizado ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.sala_membros_count_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.salas SET membros_count = membros_count + 1 WHERE id = NEW.sala_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.salas SET membros_count = GREATEST(0, membros_count - 1) WHERE id = OLD.sala_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sala_membros_count ON public.sala_membros;
CREATE TRIGGER trg_sala_membros_count
AFTER INSERT OR DELETE ON public.sala_membros
FOR EACH ROW EXECUTE FUNCTION public.sala_membros_count_sync();

-- ── Criar Sala (transacional: cria conversation + sala + membro admin) ─
CREATE OR REPLACE FUNCTION public.sala_criar(
  p_nome text, p_descricao text, p_foto_url text, p_tipo text, p_slug text
) RETURNS public.salas
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
  v_sala public.salas;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário sessão iniciada.';
  END IF;
  IF p_tipo NOT IN ('publica','privada','anuncios') THEN
    RAISE EXCEPTION 'Tipo de sala inválido.';
  END IF;

  INSERT INTO public.conversations (is_official, reply_allowed)
    VALUES (false, true)
    RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, auth.uid());

  INSERT INTO public.salas (nome, descricao, foto_url, tipo, slug, criador_id, conversation_id, membros_count)
    VALUES (p_nome, p_descricao, p_foto_url, p_tipo, p_slug, auth.uid(), v_conv_id, 1)
    RETURNING * INTO v_sala;

  INSERT INTO public.sala_membros (sala_id, user_id, papel)
    VALUES (v_sala.id, auth.uid(), 'admin');

  RETURN v_sala;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sala_criar(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sala_criar(text,text,text,text,text) TO authenticated;

-- ── Entrar numa Sala ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sala_entrar(p_sala_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário sessão iniciada.';
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

REVOKE EXECUTE ON FUNCTION public.sala_entrar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sala_entrar(uuid) TO authenticated;
