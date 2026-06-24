-- ============================================================
-- FIX: owners de comunidades antigas sem linha em community_members
--
-- A inserção automática do owner em community_members (ver
-- comunidade.tsx handleCreate) só existe no fluxo de criação atual.
-- Comunidades criadas antes dessa lógica (ou em que esse insert
-- falhou silenciosamente, ver o catch em comunidade.tsx ~659)
-- ficaram com o owner sem essa linha.
--
-- Sintoma: nessas comunidades o owner consegue enviar TEXTO (a
-- política de INSERT em community_messages já tem um fallback por
-- owner_id, corrigido em 20260621082522), mas falha SEMPRE ao
-- enviar imagem/áudio/vídeo/ficheiro, porque:
--   - a política de upload do bucket "chat-media" (20260621090000)
--     só verifica community_members, sem fallback por owner_id;
--   - a política de INSERT em community_key_shares tem o mesmo
--     problema, pelo que o owner nunca consegue persistir o seu
--     próprio share da GroupKey (distributeGroupKey em e2ee.ts).
-- Como o upload falha ANTES da mensagem ser gravada na BD, ao
-- atualizar a página a mensagem falhada desaparece (nunca chegou a
-- existir no servidor) — exatamente o comportamento reportado.
--
-- Esta migração:
--   1. Repara os dados: insere a linha em community_members para
--      todo owner de comunidade que ainda não a tinha.
--   2. Alinha as políticas de storage.objects (chat-media) e de
--      community_key_shares para aceitarem também o owner via
--      communities.owner_id — tal como já acontece em
--      community_messages — para que isto não volte a acontecer se
--      o insert do owner em community_members falhar outra vez.
-- ============================================================

-- 1. Backfill: garantir que todo owner tem uma linha em community_members
INSERT INTO public.community_members (community_id, user_id, role)
SELECT c.id, c.owner_id, 'owner'
FROM public.communities c
WHERE c.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.community_members cm
     WHERE cm.community_id = c.id AND cm.user_id = c.owner_id
  )
ON CONFLICT (community_id, user_id) DO NOTHING;

-- 2. Upload de mídia no chat: aceitar também o owner da comunidade,
--    mesmo sem linha em community_members.
DROP POLICY IF EXISTS "chat media upload own folder" ON storage.objects;
CREATE POLICY "chat media upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND (
      EXISTS (
        SELECT 1 FROM public.community_members cm
         WHERE cm.user_id = auth.uid()
           AND cm.community_id::text = (storage.foldername(name))[2]
      )
      OR EXISTS (
        SELECT 1 FROM public.communities c
         WHERE c.owner_id = auth.uid()
           AND c.id::text = (storage.foldername(name))[2]
      )
    )
  );

-- 3. Leitura de mídia no chat: idem.
DROP POLICY IF EXISTS "chat media read members" ON storage.objects;
CREATE POLICY "chat media read members" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.community_members cm
         WHERE cm.user_id = auth.uid()
           AND cm.community_id::text = (storage.foldername(name))[2]
      )
      OR EXISTS (
        SELECT 1 FROM public.communities c
         WHERE c.owner_id = auth.uid()
           AND c.id::text = (storage.foldername(name))[2]
      )
    )
  );

-- 4. Key shares E2EE: o owner também pode gravar o seu próprio share
--    (necessário para distributeGroupKey conseguir persistir a chave
--    e a GroupKey ficar disponível para cifrar/decifrar mídia).
DROP POLICY IF EXISTS "cks insert member" ON public.community_key_shares;
CREATE POLICY "cks insert member" ON public.community_key_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      EXISTS (
        SELECT 1 FROM public.community_members
         WHERE community_id = community_key_shares.community_id
           AND user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.communities c
         WHERE c.id = community_key_shares.community_id
           AND c.owner_id = auth.uid()
      )
    )
  );
