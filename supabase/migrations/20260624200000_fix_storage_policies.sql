-- ============================================================
-- Fix: políticas de storage para messages-media
-- Permite leitura pública e escrita autenticada
-- ============================================================

-- Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'messages-media',
  'messages-media',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime','audio/webm','audio/mp4','audio/mpeg','audio/ogg','application/pdf','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800;

-- Remover políticas antigas
DROP POLICY IF EXISTS "messages-media public read"  ON storage.objects;
DROP POLICY IF EXISTS "messages-media auth upload"  ON storage.objects;
DROP POLICY IF EXISTS "messages-media auth delete"  ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads"          ON storage.objects;

-- Leitura pública (qualquer um pode ver as media)
CREATE POLICY "messages-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'messages-media');

-- Upload apenas autenticado
CREATE POLICY "messages-media auth upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'messages-media');

-- Update apenas do próprio utilizador
CREATE POLICY "messages-media auth update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'messages-media' AND auth.uid()::text = (storage.foldername(name))[2]);

-- Delete apenas do próprio utilizador
CREATE POLICY "messages-media auth delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'messages-media' AND auth.uid()::text = (storage.foldername(name))[2]);
