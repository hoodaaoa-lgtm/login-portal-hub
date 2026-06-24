-- ============================================================
-- FIX: mensagens desaparecem ao refresh + bucket messages-media
-- ============================================================

-- 1. Garantir que RLS está activa na tabela messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 2. Recriar políticas de mensagens de forma limpa
DROP POLICY IF EXISTS "msg read participants"      ON public.messages;
DROP POLICY IF EXISTS "msg insert own"             ON public.messages;
DROP POLICY IF EXISTS "msg insert own strict"      ON public.messages;
DROP POLICY IF EXISTS "msg update own"             ON public.messages;
DROP POLICY IF EXISTS "msg delete own"             ON public.messages;
DROP POLICY IF EXISTS "messages_select"            ON public.messages;
DROP POLICY IF EXISTS "messages_insert"            ON public.messages;
DROP POLICY IF EXISTS "messages_update"            ON public.messages;
DROP POLICY IF EXISTS "messages_delete"            ON public.messages;

-- SELECT: participantes da conversa vêem as mensagens (excluindo apagadas para todos)
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT TO authenticated
  USING (
    deleted_for_all = FALSE AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- INSERT: só pode inserir na própria conversa como remetente
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- UPDATE: participantes podem actualizar (status read, deleted_for_all, edited_at)
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

-- DELETE: só o remetente pode apagar
CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

-- 4. Bucket messages-media (público para leitura)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'messages-media',
  'messages-media',
  true,
  52428800, -- 50 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','audio/webm','audio/mpeg','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- 5. Políticas do Storage para messages-media
DROP POLICY IF EXISTS "auth users upload messages-media"  ON storage.objects;
DROP POLICY IF EXISTS "public read messages-media"        ON storage.objects;
DROP POLICY IF EXISTS "owner delete messages-media"       ON storage.objects;
DROP POLICY IF EXISTS "msg_media_insert"                  ON storage.objects;
DROP POLICY IF EXISTS "msg_media_select"                  ON storage.objects;
DROP POLICY IF EXISTS "msg_media_delete"                  ON storage.objects;

CREATE POLICY "msg_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'messages-media');

CREATE POLICY "msg_media_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'messages-media');

CREATE POLICY "msg_media_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'messages-media');
