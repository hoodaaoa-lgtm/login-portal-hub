-- "Eliminar para mim": esconde uma publicação só para quem pediu, sem apagar
-- a linha original (que continua visível para todos os outros).
CREATE TABLE IF NOT EXISTS public.post_hidden (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_hidden TO authenticated;
GRANT ALL ON public.post_hidden TO service_role;
ALTER TABLE public.post_hidden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post hidden read own" ON public.post_hidden;
DROP POLICY IF EXISTS "post hidden insert own" ON public.post_hidden;
DROP POLICY IF EXISTS "post hidden delete own" ON public.post_hidden;
CREATE POLICY "post hidden read own" ON public.post_hidden
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "post hidden insert own" ON public.post_hidden
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post hidden delete own" ON public.post_hidden
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Índice em falta para acelerar os comentários por utilizador (likes/edição/apagar).
CREATE INDEX IF NOT EXISTS post_comments_user_idx ON public.post_comments(user_id);

-- Partilhar publicação noutra comunidade: cria uma nova linha em posts ligada
-- à publicação original, para sabermos a origem da partilha.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS shared_from_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS posts_shared_from_idx ON public.posts(shared_from_post_id);
