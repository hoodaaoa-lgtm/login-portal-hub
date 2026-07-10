-- ============================================================================
-- Mensagens oficiais do sistema, por categoria (broadcast em cartão, sem perfil)
-- ============================================================================
-- Sistema NOVO e independente do "Hooda Oficial" (conversas 1:1 com
-- is_official/reply_allowed em public.conversations, ver
-- 20260706150000_official_conversation_rpc.sql) e do broadcast de texto
-- simples do painel (aba "Comunicados", que usa esse mesmo mecanismo de
-- conversa 1:1 replicado para todos).
--
-- Este sistema não usa conversas nem mensagens normais: são cartões ricos
-- (imagem + título + descrição + botão de ação) que chegam à caixa de
-- entrada mas nunca aparecem no feed, não têm perfil público, não têm
-- seguidores e o utilizador NUNCA pode responder.
--
-- Categorias (fixas nesta fase): INSTALL_APP, UPDATES, TIPS.
-- Depende de public.is_hooda_admin(), criada em 20260705000000_official_admin_messages.sql
-- ============================================================================

-- ── Mensagem-modelo (o que o admin cria) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.official_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL CHECK (category IN ('INSTALL_APP', 'UPDATES', 'TIPS')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  image_url     TEXT,
  button_text   TEXT,
  action_type   TEXT NOT NULL DEFAULT 'none' CHECK (action_type IN ('install_pwa', 'open_page', 'open_link', 'none')),
  action_value  TEXT,
  audience      TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'new_users', 'not_installed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS official_messages_created_idx ON public.official_messages(created_at DESC);

-- ── Destinatários (fan-out por utilizador) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_official_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id   UUID NOT NULL REFERENCES public.official_messages(id) ON DELETE CASCADE,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  archived     BOOLEAN NOT NULL DEFAULT false,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  clicked_at   TIMESTAMPTZ,
  UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS user_official_messages_user_idx ON public.user_official_messages(user_id, received_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.official_messages TO authenticated;
GRANT ALL ON public.official_messages TO service_role;
GRANT SELECT, UPDATE ON public.user_official_messages TO authenticated;
GRANT ALL ON public.user_official_messages TO service_role;

ALTER TABLE public.official_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_official_messages ENABLE ROW LEVEL SECURITY;

-- Admin vê/gere tudo. Utilizador normal só vê a mensagem-modelo se a recebeu.
DROP POLICY IF EXISTS "admin manage official messages" ON public.official_messages;
CREATE POLICY "admin manage official messages" ON public.official_messages
  FOR ALL TO authenticated
  USING ( public.is_hooda_admin() )
  WITH CHECK ( public.is_hooda_admin() );

DROP POLICY IF EXISTS "user read received official messages" ON public.official_messages;
CREATE POLICY "user read received official messages" ON public.official_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_official_messages uom
      WHERE uom.message_id = official_messages.id AND uom.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin manage user official messages" ON public.user_official_messages;
CREATE POLICY "admin manage user official messages" ON public.user_official_messages
  FOR ALL TO authenticated
  USING ( public.is_hooda_admin() )
  WITH CHECK ( public.is_hooda_admin() );

DROP POLICY IF EXISTS "user read own official messages" ON public.user_official_messages;
CREATE POLICY "user read own official messages" ON public.user_official_messages
  FOR SELECT TO authenticated
  USING ( user_id = auth.uid() );

-- Utilizador só pode marcar como lida/arquivada ou registar o clique — nunca
-- mudar o dono nem a mensagem a que pertence.
DROP POLICY IF EXISTS "user update own official messages" ON public.user_official_messages;
CREATE POLICY "user update own official messages" ON public.user_official_messages
  FOR UPDATE TO authenticated
  USING ( user_id = auth.uid() )
  WITH CHECK ( user_id = auth.uid() );

-- ── Coluna para saber quem já instalou a PWA (necessário para o público
--    "Utilizadores que ainda não instalaram") ──────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pwa_installed BOOLEAN NOT NULL DEFAULT false;
-- Sem política nova: "Users update own profile" (20260624123941) já permite
-- ao próprio utilizador atualizar qualquer coluna da sua linha, incluindo esta.

-- ── RPC: admin cria a mensagem e envia para o público escolhido, tudo numa
--    transação (mensagem sem destinatários nunca fica "meio enviada") ──────
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

  SELECT COUNT(*) INTO v_count FROM public.user_official_messages WHERE message_id = v_msg_id;

  RETURN QUERY SELECT v_msg_id, v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_official_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_official_message(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Fim.
