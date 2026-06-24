-- Likes e respostas em comentários (estilo Facebook)
-- Respostas = a própria post_comments, encadeada via parent_comment_id.
-- Likes = nova tabela post_comment_likes (par único comment_id/user_id).

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS post_comments_parent_idx ON public.post_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON public.post_comments(post_id);

CREATE TABLE IF NOT EXISTS public.post_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.post_comment_likes TO authenticated;
GRANT ALL ON public.post_comment_likes TO service_role;

ALTER TABLE public.post_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment likes read" ON public.post_comment_likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "comment likes insert own" ON public.post_comment_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comment likes delete own" ON public.post_comment_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
