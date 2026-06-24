-- =====================================================
-- FIX DEFINITIVO: sistema de mensagens
-- Problema 1: conversation_participants INSERT falha com 403
--   → A RLS exige auth.uid() = user_id, mas o frontend
--     tenta inserir DOIS participantes de uma vez (o próprio
--     e o outro utilizador). O insert do "outro" viola a policy.
--   → Solução: função RPC SECURITY DEFINER que cria conversa
--     + ambos os participantes atomicamente, contornando
--     a RLS de forma segura e controlada.
--
-- Problema 2: msg_permission CHECK constraint não inclui 'aprovados'
--   → O código verifica perm === "aprovados" mas o DB só aceita
--     'todos' | 'seguidores' | 'mutuos'.
--   → Solução: adicionar 'aprovados' ao CHECK constraint.
--
-- Problema 3: tabela messages não tem colunas message_type,
--   media_url, duration, reply_to usadas pelo frontend.
--   → Solução: adicionar colunas com valores default seguros.
-- =====================================================

-- ── 1. Adicionar 'aprovados' ao CHECK de msg_permission ──
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_msg_permission_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_msg_permission_check
  CHECK (msg_permission IN ('todos', 'seguidores', 'mutuos', 'aprovados'));

-- ── 2. Adicionar colunas em falta na tabela messages ──
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'audio', 'sticker', 'video', 'file'));

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url text;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS duration integer;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- Tornar content nullable (necessário para mensagens de media sem texto)
ALTER TABLE public.messages
  ALTER COLUMN content DROP NOT NULL;

-- ── 3. RPC SECURITY DEFINER para criar conversa + participantes ──
-- Esta função corre com os privilégios do criador (service role),
-- contornando de forma SEGURA a RLS de conversation_participants.
-- Validações de segurança estão dentro da própria função.
CREATE OR REPLACE FUNCTION public.create_conversation_with_participants(
  p_my_id uuid,
  p_other_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  -- Garantia de segurança: só o utilizador autenticado pode chamar
  -- esta função para si próprio
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF auth.uid() != p_my_id THEN
    RAISE EXCEPTION 'Não autorizado: só podes criar conversas para ti próprio';
  END IF;

  -- Verificar se já existe conversa entre os dois utilizadores
  SELECT cp1.conversation_id INTO v_conv_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = p_my_id
    AND cp2.user_id = p_other_id
  LIMIT 1;

  -- Se já existe, retornar o ID existente
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Criar nova conversa
  INSERT INTO public.conversations DEFAULT VALUES
  RETURNING id INTO v_conv_id;

  -- Inserir ambos os participantes (SECURITY DEFINER contorna RLS aqui)
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, p_my_id), (v_conv_id, p_other_id);

  RETURN v_conv_id;
END;
$$;

-- Revogar acesso público; apenas utilizadores autenticados podem chamar
REVOKE EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid, uuid) TO authenticated;

-- ── 4. Índices extra para performance ──
CREATE INDEX IF NOT EXISTS idx_messages_message_type
  ON public.messages(message_type);
