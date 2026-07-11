-- ============================================================================
-- Corrige "column reference message_id is ambiguous" em send_official_message
-- ============================================================================
-- RETURNS TABLE (message_id UUID, recipients INT) cria variáveis de saída
-- chamadas message_id/recipients, visíveis dentro do corpo da função. Como
-- public.user_official_messages também tem uma coluna message_id, a query
-- "WHERE message_id = v_msg_id" ficava ambígua entre a coluna da tabela e a
-- variável de saída. Corrigido com alias explícito na tabela.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.send_official_message(
  p_category     TEXT,
  p_title        TEXT,
  p_description  TEXT,
  p_image_url    TEXT,
  p_button_text  TEXT,
  p_action_type  TEXT,
  p_action_value TEXT,
  p_audience     TEXT
)
RETURNS TABLE (message_id UUID, recipients INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg_id UUID;
  v_count  INT;
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'Não autorizado: apenas a equipa Hooda pode enviar mensagens oficiais';
  END IF;

  INSERT INTO public.official_messages
    (category, title, description, image_url, button_text, action_type, action_value, audience, created_by)
  VALUES
    (p_category, p_title, p_description, p_image_url, p_button_text, p_action_type, p_action_value, p_audience, auth.uid())
  RETURNING id INTO v_msg_id;

  IF p_audience = 'new_users' THEN
    INSERT INTO public.user_official_messages (user_id, message_id)
    SELECT p.id, v_msg_id FROM public.profiles p
    WHERE p.created_at >= now() - interval '7 days';
  ELSIF p_audience = 'not_installed' THEN
    INSERT INTO public.user_official_messages (user_id, message_id)
    SELECT p.id, v_msg_id FROM public.profiles p
    WHERE p.pwa_installed = false;
  ELSE
    INSERT INTO public.user_official_messages (user_id, message_id)
    SELECT p.id, v_msg_id FROM public.profiles p;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.user_official_messages uom WHERE uom.message_id = v_msg_id;

  RETURN QUERY SELECT v_msg_id, v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_official_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_official_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Fim.
