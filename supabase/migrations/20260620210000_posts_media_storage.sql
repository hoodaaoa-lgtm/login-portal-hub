-- Permite que publicações (feed das comunidades e geral) guardem media real:
-- várias fotos (photos), 1 vídeo (video_url, já existia) e 1 áudio (audio_url).
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS photos text[],
  ADD COLUMN IF NOT EXISTS audio_url text;

-- Bucket dedicado a media de publicações (imagens, vídeos, áudio).
-- Público para leitura, já que o feed das comunidades é visível a quem tem acesso à comunidade.
INSERT INTO storage.buckets (id, name, public)
VALUES ('posts-media', 'posts-media', true)
ON CONFLICT (id) DO NOTHING;

-- Upload: só o próprio utilizador autenticado pode escrever na sua pasta
-- (caminho esperado: posts-media/{user_id}/{community_id}/{ficheiro}).
DROP POLICY IF EXISTS "posts media upload own folder" ON storage.objects;
CREATE POLICY "posts media upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'posts-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Leitura: público (bucket público), incluindo utilizadores anónimos a ver o feed.
DROP POLICY IF EXISTS "posts media public read" ON storage.objects;
CREATE POLICY "posts media public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'posts-media');

-- Remoção: só o autor do ficheiro pode apagá-lo.
DROP POLICY IF EXISTS "posts media delete own" ON storage.objects;
CREATE POLICY "posts media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'posts-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
