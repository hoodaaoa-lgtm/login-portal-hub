-- Tabela de notificações (menções, likes, follows, etc.)
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('mention','like','comment','follow','message','video_like','video_comment')),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_username TEXT,
  post_id     UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id  UUID,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notif_user_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_read_idx ON public.notifications(user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif self read"   ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif insert auth" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notif self update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notif self delete" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
