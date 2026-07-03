
-- Add scheduling/studio columns to posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS hashtags text[],
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS poll jsonb,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS posts_scheduled_at_idx ON public.posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_is_draft_idx ON public.posts(is_draft) WHERE is_draft = true;

-- Replace public SELECT policies so scheduled/draft posts are hidden until publish time
DROP POLICY IF EXISTS "posts read all" ON public.posts;
DROP POLICY IF EXISTS "posts_clips_public_read" ON public.posts;

CREATE POLICY "posts_read_published_or_own"
  ON public.posts FOR SELECT
  USING (
    (is_draft = false AND (scheduled_at IS NULL OR scheduled_at <= now()))
    OR author_id = auth.uid()
  );
