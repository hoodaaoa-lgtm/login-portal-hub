-- ═══════════════════════════════════════════════════════════════════════
-- FIX: rede_criar devolvia a Rede com membros_count = 0 e sem refletir
-- o próprio criador como membro, porque a variável v_rede era capturada
-- (via RETURNING) ANTES do INSERT em rede_membros — e é só esse insert
-- que despoleta o trigger que atualiza membros_count. O frontend usava
-- essa resposta directamente, por isso o dono da Rede aparecia como se
-- não fosse membro (botão "Escrever-se"/"Entrar" em vez de já estar
-- inscrito, e "0 membros" no cabeçalho).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rede_criar(
  p_username text, p_nome text, p_avatar_url text, p_categoria text,
  p_tipo text, p_tem_chat boolean, p_capa_url text DEFAULT NULL
) RETURNS public.redes AS $$
DECLARE
  v_rede public.redes;
  v_conv_id uuid;
  v_rede_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF p_tem_chat THEN
    INSERT INTO public.conversations (is_official, reply_allowed) VALUES (false, true) RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO public.redes (username, nome, avatar_url, capa_url, categoria, tipo, tem_chat, criador_id, conversation_id, verificada)
  VALUES (lower(p_username), p_nome, p_avatar_url, p_capa_url, p_categoria, p_tipo, p_tem_chat, auth.uid(), v_conv_id, false)
  RETURNING id INTO v_rede_id;

  INSERT INTO public.rede_membros (rede_id, user_id, papel, estado) VALUES (v_rede_id, auth.uid(), 'admin', 'ativo');

  IF v_conv_id IS NOT NULL THEN
    UPDATE public.conversations SET rede_id = v_rede_id WHERE id = v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_conv_id, auth.uid());
  END IF;

  -- Vai buscar a linha já com membros_count atualizado pelo trigger,
  -- em vez de devolver a fotografia antiga capturada antes do membro
  -- ser inserido.
  SELECT * INTO v_rede FROM public.redes WHERE id = v_rede_id;

  RETURN v_rede;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rede_criar(text, text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rede_criar(text, text, text, text, text, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
