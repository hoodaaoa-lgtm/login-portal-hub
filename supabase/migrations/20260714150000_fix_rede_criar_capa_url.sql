-- ═══════════════════════════════════════════════════════════════════════
-- FIX: rede_criar estava sem o parâmetro p_capa_url, mas o frontend
-- (src/lib/redes.ts) já o envia desde o commit "Add capaUrl to
-- CriarRedeInput type". Isso fazia o RPC falhar (PostgREST não encontra
-- nenhuma função rede_criar com essa assinatura) e nenhuma Rede era
-- criada — daí a página /redes/$username mostrar "Esta Rede não existe".
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.rede_criar(text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.rede_criar(
  p_username text, p_nome text, p_avatar_url text, p_categoria text,
  p_tipo text, p_tem_chat boolean, p_capa_url text DEFAULT NULL
) RETURNS public.redes AS $$
DECLARE
  v_rede public.redes;
  v_conv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF p_tem_chat THEN
    INSERT INTO public.conversations (is_official, reply_allowed) VALUES (false, true) RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO public.redes (username, nome, avatar_url, capa_url, categoria, tipo, tem_chat, criador_id, conversation_id, verificada)
  VALUES (lower(p_username), p_nome, p_avatar_url, p_capa_url, p_categoria, p_tipo, p_tem_chat, auth.uid(), v_conv_id, false)
  RETURNING * INTO v_rede;

  INSERT INTO public.rede_membros (rede_id, user_id, papel, estado) VALUES (v_rede.id, auth.uid(), 'admin', 'ativo');

  IF v_conv_id IS NOT NULL THEN
    UPDATE public.conversations SET rede_id = v_rede.id WHERE id = v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (v_conv_id, auth.uid());
  END IF;

  RETURN v_rede;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rede_criar(text, text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rede_criar(text, text, text, text, text, boolean, text) TO authenticated;

-- Sem isto, o PostgREST pode continuar a servir a assinatura antiga da
-- função a partir da cache, mesmo depois da função ter sido alterada.
NOTIFY pgrst, 'reload schema';
