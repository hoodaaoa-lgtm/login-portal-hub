-- ============================================================
-- E2EE — Encriptação ponta-a-ponta para o chat de comunidades
-- ============================================================

-- 1. Chave pública ECDH de cada utilizador (guardada no perfil)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS e2ee_public_key text;

-- 2. Tabela de key shares: a GroupKey cifrada para cada membro
--    Cada linha = a cópia da GroupKey da comunidade X cifrada para o membro Y
CREATE TABLE IF NOT EXISTS public.community_key_shares (
  community_id   uuid    NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  recipient_id   uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id      uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Chave pública ECDH do remetente (necessária para decifrar)
  sender_public_key  text NOT NULL,
  -- GroupKey cifrada: IV(12 bytes) || ciphertext, em base64
  encrypted_key  text    NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, recipient_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cks_recipient ON public.community_key_shares(recipient_id);
CREATE INDEX IF NOT EXISTS idx_cks_community ON public.community_key_shares(community_id);

-- Permissões
GRANT SELECT, INSERT, UPDATE ON public.community_key_shares TO authenticated;
GRANT ALL ON public.community_key_shares TO service_role;

-- RLS
ALTER TABLE public.community_key_shares ENABLE ROW LEVEL SECURITY;

-- Cada membro só lê o seu próprio share
CREATE POLICY "cks select own" ON public.community_key_shares
  FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id);

-- Membros da comunidade podem inserir/actualizar shares
CREATE POLICY "cks insert member" ON public.community_key_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = community_key_shares.community_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "cks update member" ON public.community_key_shares
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = sender_id
  );

-- 3. Adicionar coluna is_encrypted à tabela community_messages (opcional, para indexar)
ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS is_encrypted boolean NOT NULL DEFAULT false;

-- Índice para filtrar mensagens encriptadas
CREATE INDEX IF NOT EXISTS idx_cmsg_encrypted ON public.community_messages(community_id, is_encrypted);

-- 4. O campo community_members já existe; garantir que profiles está acessível
--    para o JOIN em getGroupKey (membros -> perfis -> e2ee_public_key)
DROP POLICY IF EXISTS "profiles_search" ON public.profiles;
CREATE POLICY "profiles_search" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- 5. community_members — permitir SELECT com JOIN em profiles
DROP POLICY IF EXISTS "cm read own" ON public.community_members;
CREATE POLICY "cm read member or public" ON public.community_members
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_members.community_id
         AND (c.privacy = 'public' OR c.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.community_members me
       WHERE me.community_id = community_members.community_id
         AND me.user_id = auth.uid()
    )
  );
