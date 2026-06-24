-- ============================================================
-- FIX: bucket "chat-media" nunca tinha sido criado.
--
-- src/lib/chatMedia.ts já assumia (em comentário) que existia uma
-- migração "20260620240000_chat_media_private_bucket.sql" a criar este
-- bucket privado com RLS — essa migração nunca chegou a ser escrita/aplicada.
-- Resultado: TODO upload de imagem/áudio/vídeo/ficheiro no chat de
-- comunidade falhava sempre (bucket inexistente), com mensagens a ficar
-- "a carregar" para sempre ou a falhar sem explicação clara na UI.
--
-- Esta migração:
--   1. Cria o bucket privado "chat-media" (sem leitura pública/anon).
--   2. Define limite de tamanho de ficheiro ao nível do bucket (50MB —
--      cobre imagem/áudio/vídeo curto/documentos; o cliente já valida
--      limites mais apertados por tipo antes de subir).
--   3. Cria políticas RLS:
--        - INSERT: só o próprio utilizador autenticado, só na sua pasta
--          (chat-media/{user_id}/{community_id}/...), e só se for membro
--          da comunidade.
--        - SELECT: só membros da comunidade correspondente ao path,
--          via signed URL (o bucket continua privado para "anon").
--        - DELETE: só o autor do ficheiro.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', false, 52428800) -- 50MB
ON CONFLICT (id) DO UPDATE SET file_size_limit = 52428800, public = false;

-- Upload: só o próprio utilizador, na sua própria pasta, e só se for
-- membro da comunidade indicada no path (path = {user_id}/{community_id}/...).
DROP POLICY IF EXISTS "chat media upload own folder" ON storage.objects;
CREATE POLICY "chat media upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND EXISTS (
      SELECT 1 FROM public.community_members cm
       WHERE cm.user_id = auth.uid()
         AND cm.community_id::text = (storage.foldername(name))[2]
    )
  );

-- Leitura: qualquer membro autenticado da comunidade pode gerar signed URL
-- e descarregar o ciphertext (decifragem acontece no cliente com a GroupKey).
DROP POLICY IF EXISTS "chat media read members" ON storage.objects;
CREATE POLICY "chat media read members" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.community_members cm
       WHERE cm.user_id = auth.uid()
         AND cm.community_id::text = (storage.foldername(name))[2]
    )
  );

-- Remoção: só o autor do ficheiro.
DROP POLICY IF EXISTS "chat media delete own" ON storage.objects;
CREATE POLICY "chat media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
