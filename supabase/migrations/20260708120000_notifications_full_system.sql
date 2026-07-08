-- ═══════════════════════════════════════════════════════════════════════
-- Sistema completo de notificações: triggers automáticos + push subscriptions
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Ampliar tipos permitidos em notifications
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('mention','like','comment','follow','message','video_like','video_comment','share','system','video_new'));

-- 2) Tabela de subscrições push (uma por dispositivo/navegador)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subs_user_idx ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push subs self all" ON public.push_subscriptions;
CREATE POLICY "push subs self all" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- 3) Realtime para notifications
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4) Trigger: nova mensagem -> notifica os outros participantes da conversa
CREATE OR REPLACE FUNCTION public.trg_notify_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_username TEXT;
BEGIN
  SELECT username INTO sender_username FROM public.profiles WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, type, actor_id, actor_username)
  SELECT cp.user_id, 'message', NEW.sender_id, sender_username
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_message_notify ON public.messages;
CREATE TRIGGER on_message_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_message();

-- 5) Trigger: novo seguidor
CREATE OR REPLACE FUNCTION public.trg_notify_follow()
RETURNS TRIGGER AS $$
DECLARE
  follower_username TEXT;
BEGIN
  IF NEW.following_id IS NULL OR NEW.following_id = NEW.follower_id THEN
    RETURN NEW;
  END IF;

  SELECT username INTO follower_username FROM public.profiles WHERE id = NEW.follower_id;

  INSERT INTO public.notifications (user_id, type, actor_id, actor_username)
  VALUES (NEW.following_id, 'follow', NEW.follower_id, follower_username);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_follow_notify ON public.follows;
CREATE TRIGGER on_follow_notify
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_follow();

-- 6) Trigger: like num post
CREATE OR REPLACE FUNCTION public.trg_notify_like()
RETURNS TRIGGER AS $$
DECLARE
  post_owner UUID;
  liker_username TEXT;
BEGIN
  SELECT author_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT username INTO liker_username FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, actor_id, actor_username, post_id)
  VALUES (post_owner, 'like', NEW.user_id, liker_username, NEW.post_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_like_notify ON public.post_likes;
CREATE TRIGGER on_like_notify
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_like();

-- 7) Trigger: comentário num post
CREATE OR REPLACE FUNCTION public.trg_notify_comment()
RETURNS TRIGGER AS $$
DECLARE
  post_owner UUID;
BEGIN
  SELECT author_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, actor_id, actor_username, post_id, comment_id)
  VALUES (post_owner, 'comment', NEW.user_id, NEW.author_username, NEW.post_id, NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_comment_notify ON public.post_comments;
CREATE TRIGGER on_comment_notify
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_comment();

-- 8) RPC para marcar notificações como lidas
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids UUID[] DEFAULT NULL)
RETURNS void AS $$
BEGIN
  IF p_ids IS NULL THEN
    UPDATE public.notifications SET read = true WHERE user_id = auth.uid() AND read = false;
  ELSE
    UPDATE public.notifications SET read = true WHERE user_id = auth.uid() AND id = ANY(p_ids);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;

