-- ============================================================================
-- Mensagens oficiais "HOODA OFICIAL" (admin -> utilizador)
-- Conta admin: infocriar178@gmail.com
-- ============================================================================
-- Corre este ficheiro inteiro no Supabase SQL Editor.
-- É seguro correr mais que uma vez (idempotente).
-- ============================================================================

-- 1) Novas colunas na tabela conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_official   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_allowed boolean NOT NULL DEFAULT true;

-- 2) Função que identifica a conta admin (por email), sem expor o email
--    a mais ninguém: corre com privilégios elevados (SECURITY DEFINER) e
--    só devolve true/false ou o uuid, nunca o email em si.
CREATE OR REPLACE FUNCTION public.is_hooda_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND email = 'infocriar178@gmail.com'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_hooda_official_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users
  WHERE email = 'infocriar178@gmail.com'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_hooda_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hooda_official_id() TO authenticated;

-- 3) Só o admin pode criar uma conversa marcada como oficial
--    (impede qualquer utilizador normal de se fazer passar por "Hooda Oficial")
DROP POLICY IF EXISTS "conv insert" ON public.conversations;
CREATE POLICY "conv insert" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK ( is_official = false OR public.is_hooda_admin() );

-- 4) Só o admin pode alterar as flags is_official / reply_allowed
DROP POLICY IF EXISTS "conv admin update official flags" ON public.conversations;
CREATE POLICY "conv admin update official flags" ON public.conversations
  FOR UPDATE TO authenticated
  USING ( public.is_hooda_admin() )
  WITH CHECK ( public.is_hooda_admin() );

-- 5) Bloquear respostas de utilizadores normais quando reply_allowed = false
--    (o admin continua sempre a poder escrever)
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
  );

-- Fim.
