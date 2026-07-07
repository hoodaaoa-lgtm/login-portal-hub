-- ═══════════════════════════════════════════════════════════════════════
-- REVISÃO COMPLETA DO SISTEMA SOCIAL: seguir, likes, comentários, views
-- Tudo passa a ser real, persistente, atómico e consistente em toda a
-- plataforma (contadores mantidos por triggers na BD, nunca só no React).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- 1. SEGUIR — garantir UNIQUE em (follower_id, target_username), que é
--    exatamente a coluna que o frontend usa em "onConflict" nos upserts.
--    Sem isto, o Postgres rejeita silenciosamente o pedido ("no unique
--    or exclusion constraint matching ON CONFLICT") e o "Seguir" falha.
--    Nota: a tabela já tem "id" como PK (ver migração 20260619090630),
--    por isso aqui só acrescentamos o UNIQUE adicional necessário.
-- ───────────────────────────────────────────────────────────────────────

DELETE FROM public.follows a USING public.follows b
WHERE a.ctid < b.ctid
  AND a.follower_id = b.follower_id
  AND a.target_username = b.target_username;

ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_follower_target_unique;
ALTER TABLE public.follows ADD CONSTRAINT follows_follower_target_unique
  UNIQUE (follower_id, target_username);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.profiles p SET
  followers_count = COALESCE((SELECT COUNT(*) FROM public.follows f WHERE f.target_username = p.username), 0),
  following_count = COALESCE((SELECT COUNT(*) FROM public.follows f WHERE f.follower_id = p.id
                                AND EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.username = f.target_username)), 0);

CREATE OR REPLACE FUNCTION public.handle_follow_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE username = NEW.target_username;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = NEW.target_username) THEN
      UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE username = OLD.target_username;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = OLD.target_username) THEN
      UPDATE public.profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_change ON public.follows;
CREATE TRIGGER trg_follow_change
AFTER INSERT OR DELETE ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.handle_follow_change();

CREATE OR REPLACE FUNCTION public.toggle_follow(p_target_username TEXT, p_target_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
  v_followers_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_target_username IS NULL OR p_target_username = '' THEN
    RAISE EXCEPTION 'target_username obrigatório';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_id = v_uid AND target_username = p_target_username) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.follows WHERE follower_id = v_uid AND target_username = p_target_username;
  ELSE
    INSERT INTO public.follows (follower_id, target_username, following_id)
    VALUES (v_uid, p_target_username, p_target_id)
    ON CONFLICT (follower_id, target_username) DO NOTHING;
  END IF;

  SELECT followers_count INTO v_followers_count FROM public.profiles WHERE username = p_target_username;

  RETURN jsonb_build_object(
    'following', NOT v_exists,
    'followers_count', COALESCE(v_followers_count, 0)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_follow(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_follow(TEXT, UUID) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 2. LIKES — trigger mantém posts.likes_count sempre igual ao número
--    real de linhas em post_likes, seja qual for o caminho usado.
-- ───────────────────────────────────────────────────────────────────────

UPDATE public.posts p SET likes_count = COALESCE((SELECT COUNT(*) FROM public.post_likes l WHERE l.post_id = p.id), 0);

CREATE OR REPLACE FUNCTION public.handle_post_like_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_like_change ON public.post_likes;
CREATE TRIGGER trg_post_like_change
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.handle_post_like_change();

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_uid) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.post_likes WHERE post_id = p_post_id AND user_id = v_uid;
  ELSE
    INSERT INTO public.post_likes (post_id, user_id) VALUES (p_post_id, v_uid) ON CONFLICT DO NOTHING;
  END IF;

  SELECT likes_count INTO v_count FROM public.posts WHERE id = p_post_id;

  RETURN jsonb_build_object('liked', NOT v_exists, 'likes_count', COALESCE(v_count, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_post_like(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_post_like(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_video_like_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET likes_count = likes_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_video_like_change ON public.video_likes;
CREATE TRIGGER trg_video_like_change
AFTER INSERT OR DELETE ON public.video_likes
FOR EACH ROW EXECUTE FUNCTION public.handle_video_like_change();

UPDATE public.videos v SET likes_count = COALESCE((SELECT COUNT(*) FROM public.video_likes l WHERE l.video_id = v.id), 0);

CREATE OR REPLACE FUNCTION public.toggle_video_like(p_video_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exists BOOLEAN;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.video_likes WHERE video_id = p_video_id AND user_id = v_uid) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.video_likes WHERE video_id = p_video_id AND user_id = v_uid;
  ELSE
    INSERT INTO public.video_likes (video_id, user_id) VALUES (p_video_id, v_uid) ON CONFLICT DO NOTHING;
  END IF;
  SELECT likes_count INTO v_count FROM public.videos WHERE id = p_video_id;
  RETURN jsonb_build_object('liked', NOT v_exists, 'likes_count', COALESCE(v_count, 0));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_video_like(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_video_like(UUID) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 3. COMENTÁRIOS — posts.comments_count mantido por trigger.
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.posts p SET comments_count = COALESCE((SELECT COUNT(*) FROM public.post_comments c WHERE c.post_id = p.id), 0);

CREATE OR REPLACE FUNCTION public.handle_post_comment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comment_change ON public.post_comments;
CREATE TRIGGER trg_post_comment_change
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_post_comment_change();

UPDATE public.videos v SET comments_count = COALESCE((SELECT COUNT(*) FROM public.video_comments c WHERE c.video_id = v.id), 0);

CREATE OR REPLACE FUNCTION public.handle_video_comment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET comments_count = comments_count + 1 WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_video_comment_change ON public.video_comments;
CREATE TRIGGER trg_video_comment_change
AFTER INSERT OR DELETE ON public.video_comments
FOR EACH ROW EXECUTE FUNCTION public.handle_video_comment_change();

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.posts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.follows; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 4. VIEWS — vídeo curto (≤30s): conta se assistiu ≥5s; vídeo mais
--    longo: conta se assistiu ≥50% da duração, até um máximo de 15 min
--    (900s); conteúdo sem vídeo: conta ao aparecer no ecrã; em qualquer
--    caso, o MESMO espectador só gera outra view passadas 12h.
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.post_views ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.post_views ADD COLUMN IF NOT EXISTS watch_seconds NUMERIC;
DROP INDEX IF EXISTS post_views_unique_idx;
CREATE INDEX IF NOT EXISTS post_views_lookup_idx ON public.post_views(post_id, COALESCE(user_id::text, viewer_fingerprint), created_at DESC);

-- Remover a assinatura antiga (2 args) — CREATE OR REPLACE só substitui uma
-- função quando a assinatura é IDÊNTICA; como esta tem mais parâmetros,
-- ficaríamos com duas funções "record_post_view" sobrepostas e chamadas
-- com 2 args ficariam ambíguas ("function is not unique").
DROP FUNCTION IF EXISTS public.record_post_view(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.record_post_view(
  p_post_id            UUID,
  p_viewer_fingerprint TEXT,
  p_watch_seconds      NUMERIC DEFAULT NULL,
  p_duration_seconds   NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT := COALESCE(v_uid::text, p_viewer_fingerprint);
  v_already BOOLEAN;
  v_threshold NUMERIC;
BEGIN
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'no_viewer_key');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.post_views
     WHERE post_id = p_post_id
       AND COALESCE(user_id::text, viewer_fingerprint) = v_key
       AND created_at > now() - INTERVAL '12 hours'
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'cooldown_12h');
  END IF;

  IF p_duration_seconds IS NOT NULL AND p_duration_seconds > 0 THEN
    IF p_duration_seconds <= 30 THEN
      v_threshold := 5;
    ELSE
      v_threshold := LEAST(900, p_duration_seconds * 0.5);
    END IF;
    IF p_watch_seconds IS NULL OR p_watch_seconds < v_threshold THEN
      RETURN jsonb_build_object('counted', false, 'reason', 'below_threshold', 'threshold', v_threshold);
    END IF;
  END IF;

  INSERT INTO public.post_views (post_id, viewer_fingerprint, user_id, watch_seconds)
  VALUES (p_post_id, p_viewer_fingerprint, v_uid, p_watch_seconds);

  UPDATE public.posts SET views_count = views_count + 1 WHERE id = p_post_id;

  RETURN jsonb_build_object('counted', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_post_view(UUID, TEXT, NUMERIC, NUMERIC) TO authenticated, anon;

UPDATE public.posts p SET views_count = COALESCE((SELECT COUNT(*) FROM public.post_views v WHERE v.post_id = p.id), 0);

ALTER TABLE public.video_views ADD COLUMN IF NOT EXISTS watch_seconds NUMERIC;
ALTER TABLE public.video_views DROP CONSTRAINT IF EXISTS video_views_video_user_unique;

-- Idem: remover TODAS as assinaturas antigas de record_video_view que se
-- foram acumulando ao longo do histórico (2, 3 e 5 argumentos), para que
-- só reste esta versão canónica de 7 argumentos e as chamadas deixem de
-- ficar ambíguas.
DROP FUNCTION IF EXISTS public.record_video_view(UUID, UUID);
DROP FUNCTION IF EXISTS public.record_video_view(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.record_video_view(UUID, UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_video_view(
  p_video_id            UUID,
  p_channel_id          UUID DEFAULT NULL,
  p_viewer_fingerprint  TEXT DEFAULT NULL,
  p_country             TEXT DEFAULT NULL,
  p_country_code        TEXT DEFAULT NULL,
  p_watch_seconds       NUMERIC DEFAULT NULL,
  p_duration_seconds    NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT := COALESCE(v_uid::text, p_viewer_fingerprint);
  v_channel_id UUID;
  v_already BOOLEAN;
  v_threshold NUMERIC;
BEGIN
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'no_viewer_key');
  END IF;

  SELECT COALESCE(p_channel_id, channel_id) INTO v_channel_id FROM public.videos WHERE id = p_video_id;

  SELECT EXISTS (
    SELECT 1 FROM public.video_views
     WHERE video_id = p_video_id
       AND COALESCE(user_id::text, viewer_fingerprint) = v_key
       AND viewed_at > now() - INTERVAL '12 hours'
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'cooldown_12h');
  END IF;

  IF p_duration_seconds IS NOT NULL AND p_duration_seconds > 0 THEN
    IF p_duration_seconds <= 30 THEN
      v_threshold := 5;
    ELSE
      v_threshold := LEAST(900, p_duration_seconds * 0.5);
    END IF;
    IF p_watch_seconds IS NULL OR p_watch_seconds < v_threshold THEN
      RETURN jsonb_build_object('counted', false, 'reason', 'below_threshold', 'threshold', v_threshold);
    END IF;
  END IF;

  INSERT INTO public.video_views (video_id, channel_id, user_id, viewer_fingerprint, country, country_code, watch_seconds, viewed_at)
  VALUES (p_video_id, v_channel_id, v_uid, p_viewer_fingerprint, p_country, p_country_code, p_watch_seconds, now());

  UPDATE public.videos SET views_count = COALESCE(views_count, 0) + 1 WHERE id = p_video_id;

  RETURN jsonb_build_object('counted', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_video_view(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated, anon;

UPDATE public.videos v SET views_count = COALESCE((SELECT COUNT(*) FROM public.video_views vv WHERE vv.video_id = v.id), 0);

COMMIT;
