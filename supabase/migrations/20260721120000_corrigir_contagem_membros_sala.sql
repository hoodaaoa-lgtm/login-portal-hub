-- ───────────────────────────────────────────────────────────────────────
-- Correção: ao criar uma Sala, membros_count aparecia como 2 em vez de 1.
--
-- Causa: sala_criar() inseria a sala já com membros_count = 1 e, logo a
-- seguir, inseria o admin em sala_membros — o que disparava o trigger
-- trg_sala_membros_count, somando +1 outra vez (1 + 1 = 2).
--
-- Correção: a sala passa a ser criada com membros_count = 0; o trigger,
-- ao inserir o admin em sala_membros, é que sobe a contagem para 1.
-- ───────────────────────────────────────────────────────────────────────

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
    VALUES (p_nome, p_descricao, p_foto_url, p_tipo, p_slug, auth.uid(), v_conv_id, 0)
    RETURNING * INTO v_sala;

  INSERT INTO public.sala_membros (sala_id, user_id, papel)
    VALUES (v_sala.id, auth.uid(), 'admin');

  -- Reflete a contagem correta (1) no registo devolvido ao chamador,
  -- já que o trigger atualiza a tabela mas não a variável local v_sala.
  v_sala.membros_count := 1;

  RETURN v_sala;
END;
$$;

-- ── Corrige salas já criadas com contagem inflada por este bug ────────
-- Recalcula membros_count de todas as salas a partir da contagem real
-- de sala_membros, para acertar quaisquer salas afetadas anteriormente.
UPDATE public.salas s
SET membros_count = (
  SELECT COUNT(*) FROM public.sala_membros sm WHERE sm.sala_id = s.id
);
