
-- Allow the storage RLS to call the SECURITY DEFINER helper
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "messages media upload own folder" ON storage.objects;
DROP POLICY IF EXISTS "messages media read own folder" ON storage.objects;
DROP POLICY IF EXISTS "messages media delete own" ON storage.objects;

CREATE POLICY "messages media read participants" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'messages-media'
    AND public.is_conversation_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "messages media upload participants" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'messages-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.is_conversation_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "messages media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'messages-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
