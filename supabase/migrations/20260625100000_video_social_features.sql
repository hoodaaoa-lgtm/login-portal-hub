-- ═══════════════════════════════════════════════════════════
-- Video Social Features: dislikes, comments, reactions, saved
-- ═══════════════════════════════════════════════════════════

-- ── video_dislikes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_dislikes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(video_id, user_id)
);
CREATE INDEX IF NOT EXISTS vd_video_idx ON public.video_dislikes(video_id);
GRANT SELECT, INSERT, DELETE ON public.video_dislikes TO authenticated;
GRANT ALL ON public.video_dislikes TO service_role;
ALTER TABLE public.video_dislikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vd public read"  ON public.video_dislikes FOR SELECT USING (true);
CREATE POLICY "vd self insert"  ON public.video_dislikes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vd self delete"  ON public.video_dislikes FOR DELETE USING (auth.uid() = user_id);

-- ── video_comments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id    UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES public.video_comments(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vc_video_idx  ON public.video_comments(video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vc_parent_idx ON public.video_comments(parent_id);
CREATE INDEX IF NOT EXISTS vc_user_idx   ON public.video_comments(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_comments TO authenticated;
GRANT SELECT ON public.video_comments TO anon;
GRANT ALL ON public.video_comments TO service_role;
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vc public read"   ON public.video_comments FOR SELECT USING (true);
CREATE POLICY "vc self insert"   ON public.video_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vc self update"   ON public.video_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "vc self delete"   ON public.video_comments FOR DELETE USING (auth.uid() = user_id);

-- ── video_comment_reactions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_comment_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.video_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (char_length(emoji) <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS vcr_comment_idx ON public.video_comment_reactions(comment_id);
GRANT SELECT, INSERT, DELETE ON public.video_comment_reactions TO authenticated;
GRANT SELECT ON public.video_comment_reactions TO anon;
GRANT ALL ON public.video_comment_reactions TO service_role;
ALTER TABLE public.video_comment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vcr public read"  ON public.video_comment_reactions FOR SELECT USING (true);
CREATE POLICY "vcr self insert"  ON public.video_comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vcr self delete"  ON public.video_comment_reactions FOR DELETE USING (auth.uid() = user_id);

-- ── saved_videos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_videos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id   UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, video_id)
);
CREATE INDEX IF NOT EXISTS sv_user_idx  ON public.saved_videos(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sv_video_idx ON public.saved_videos(video_id);
GRANT SELECT, INSERT, DELETE ON public.saved_videos TO authenticated;
GRANT ALL ON public.saved_videos TO service_role;
ALTER TABLE public.saved_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sv self read"   ON public.saved_videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sv self insert" ON public.saved_videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sv self delete" ON public.saved_videos FOR DELETE USING (auth.uid() = user_id);
