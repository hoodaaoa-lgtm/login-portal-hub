-- ============================================================================
-- Função dedicada para o admin criar conversas OFICIAIS ("Hooda Oficial")
-- ============================================================================
-- Problema: o painel admin estava a reutilizar a função genérica
-- create_conversation_with_participants (feita para conversas normais entre
-- utilizadores) e, só depois, tentava marcar a conversa como is_official=true
-- num segundo pedido separado. Se esse segundo pedido falhasse por qualquer
-- razão, a conversa ficava criada mas SEM ser oficial — aparecendo ao
-- utilizador como uma conversa normal, sem selo "Hooda Oficial" e sem
-- bloqueio de resposta a funcionar.
--
-- Esta função resolve isso de uma vez só, dentro de uma única transação:
-- verifica que quem chama é mesmo o admin, procura uma conversa oficial já
-- existente com o utilizador-alvo e, se não houver, cria a conversa JÁ como
-- oficial e insere os dois participantes — tudo atómico.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_official_conversation(p_other_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_conv_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'Não autorizado: apenas a conta oficial da Hooda pode criar conversas oficiais';
  END IF;

  v_admin_id := auth.uid();

  IF p_other_id IS NULL OR p_other_id = v_admin_id THEN
    RAISE EXCEPTION 'Utilizador-alvo inválido';
  END IF;

  -- Procurar conversa oficial já existente entre o admin e este utilizador
  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = v_admin_id
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = p_other_id
  WHERE c.is_official = true
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Criar a conversa já como oficial, com resposta permitida por omissão
  INSERT INTO public.conversations (is_official, reply_allowed)
  VALUES (true, true)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_admin_id), (v_conv_id, p_other_id);

  RETURN v_conv_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_official_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_official_conversation(uuid) TO authenticated;

-- Fim.
