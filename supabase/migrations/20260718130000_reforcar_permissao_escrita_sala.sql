-- ───────────────────────────────────────────────────────────────────────
-- Reforça no BACKEND a regra "quem pode escrever numa Sala" — até agora
-- só era imposta na interface (o SalaPanel escondia o composer), mas
-- qualquer pessoa com sessão iniciada conseguia continuar a enviar
-- mensagens diretamente para a conversa por trás de uma sala de anúncios
-- (ou de uma sala com "apenas quem eu escolher" e sem permissão), porque
-- a policy de INSERT em public.messages não sabia nada sobre Salas.
--
-- Com isto:
--   • Sala de anúncios → só admin/dono da sala pode publicar. Os
--     restantes membros só podem reagir (like), como já era mostrado
--     na interface.
--   • Sala normal com "apenas quem eu escolher" → só quem tiver
--     pode_enviar = true (ou for admin) consegue publicar.
--   • Continua tudo igual para conversas normais (DMs) — esta função
--     devolve true de imediato se a conversa não pertencer a uma sala.
--
-- Corre este ficheiro inteiro no Supabase SQL Editor. É seguro correr
-- mais que uma vez.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sala_pode_escrever(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_sala        public.salas;
  v_pode_enviar boolean;
BEGIN
  SELECT * INTO v_sala FROM public.salas WHERE conversation_id = p_conversation_id;

  -- Não é uma conversa de Sala (DM normal, mensagem oficial, etc.) —
  -- esta restrição não se aplica.
  IF v_sala.id IS NULL THEN
    RETURN true;
  END IF;

  -- Admin/dono da sala pode sempre escrever, mesmo numa sala de anúncios.
  IF public.sala_is_admin(v_sala.id, p_user_id) THEN
    RETURN true;
  END IF;

  -- Sala de anúncios: só administradores podem publicar.
  IF v_sala.tipo = 'anuncios' THEN
    RETURN false;
  END IF;

  IF v_sala.quem_pode_escrever = 'todos' THEN
    RETURN true;
  END IF;

  SELECT pode_enviar INTO v_pode_enviar
    FROM public.sala_membros
    WHERE sala_id = v_sala.id AND user_id = p_user_id;

  RETURN COALESCE(v_pode_enviar, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sala_pode_escrever(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sala_pode_escrever(uuid, uuid) TO authenticated;

-- Junta a nova verificação à mesma policy de sempre, sem tocar no resto
-- da lógica já existente (remetente + participante + bloqueio de
-- respostas em mensagens oficiais).
DROP POLICY IF EXISTS "msg insert own" ON public.messages;
CREATE POLICY "msg insert own" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
    )
    AND (
      public.is_hooda_admin()
      OR NOT EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND c.is_official = true
          AND c.reply_allowed = false
      )
    )
    AND public.sala_pode_escrever(messages.conversation_id, auth.uid())
  );

-- Fim.
