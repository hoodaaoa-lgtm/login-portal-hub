-- ═══════════════════════════════════════════════════════════════════════
-- Simplificação do Hooda Studio: eliminar "channels" como entidade
-- separada. O perfil (profiles) passa a ser o único conceito.
--
-- NOTA: esta migração já foi executada manualmente no projeto Supabase
-- (SQL editor). Este arquivo apenas versiona o que já rodou em produção,
-- para manter o histórico de migrations do repo consistente com o schema
-- remoto real. Não rodar de novo manualmente sem conferir o estado atual.
--
-- Esta versão é defensiva: várias das tabelas mencionadas no plano
-- original (post_analytics, creator_earnings, scheduled_posts,
-- channel_watermark_settings) podem nunca ter chegado a ser criadas na
-- tua base de dados real (a migração que as criava pode nunca ter
-- corrido) — por isso cada bloco só actua SE a tabela existir. Nada
-- rebenta se uma tabela não existir.
-- ═══════════════════════════════════════════════════════════════════════

-- 0) channel_stats_view depende de videos.channel_id — apagar primeiro.
DROP VIEW IF EXISTS public.channel_stats_view;

-- 1) profiles ganha as colunas que só existiam em channels ─────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS category   TEXT,
  ADD COLUMN IF NOT EXISTS country    TEXT;

-- 2) Copiar dados de channels para profiles (só se channels existir) ────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channels') THEN
    UPDATE public.profiles p SET
      full_name  = COALESCE(NULLIF(p.full_name, ''), c.name),
      bio        = COALESCE(NULLIF(p.bio, ''), c.description),
      avatar_url = COALESCE(p.avatar_url, c.avatar_url),
      banner_url = COALESCE(p.banner_url, c.banner_url),
      category   = COALESCE(p.category, c.category),
      country    = COALESCE(p.country, c.country)
    FROM public.channels c
    WHERE c.owner_id = p.id;
  END IF;
END $$;

-- 3) videos: channel_id é redundante (já existe owner_id) ───────────────
ALTER TABLE public.videos DROP COLUMN IF EXISTS channel_id;

-- 4) posts.channel_id — nunca essencial (author_id já identifica o dono) ─
DROP INDEX IF EXISTS public.posts_channel_idx;
ALTER TABLE public.posts DROP COLUMN IF EXISTS channel_id;

-- 5) video_views: repontar channel_id -> profile_id ──────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='video_views' AND column_name='channel_id') THEN
    DROP POLICY IF EXISTS "vv owner read" ON public.video_views;
    ALTER TABLE public.video_views ADD COLUMN IF NOT EXISTS profile_id UUID;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channels') THEN
      UPDATE public.video_views v SET profile_id = c.owner_id
      FROM public.channels c WHERE v.channel_id = c.id AND v.profile_id IS NULL;
    END IF;
    ALTER TABLE public.video_views DROP COLUMN IF EXISTS channel_id;
    ALTER TABLE public.video_views ALTER COLUMN profile_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS video_views_profile_idx ON public.video_views(profile_id);
    GRANT SELECT (id, video_id, profile_id, user_id, country, watch_pct, viewed_at, country_code)
      ON public.video_views TO authenticated;
    CREATE POLICY "vv owner read" ON public.video_views
      FOR SELECT TO authenticated USING (profile_id = auth.uid());
  END IF;
END $$;

-- 6) post_analytics: channel_id -> profile_id (só se a tabela existir) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_analytics') THEN
    ALTER TABLE public.post_analytics ADD COLUMN IF NOT EXISTS profile_id UUID;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_analytics' AND column_name='channel_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channels') THEN
      UPDATE public.post_analytics t SET profile_id = c.owner_id
      FROM public.channels c WHERE t.channel_id = c.id AND t.profile_id IS NULL;
    END IF;
    ALTER TABLE public.post_analytics DROP COLUMN IF EXISTS channel_id;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='post_analytics_profile_fk') THEN
      ALTER TABLE public.post_analytics ADD CONSTRAINT post_analytics_profile_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- 7) creator_earnings: channel_id -> profile_id (só se a tabela existir) ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='creator_earnings') THEN
    ALTER TABLE public.creator_earnings ADD COLUMN IF NOT EXISTS profile_id UUID;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='creator_earnings' AND column_name='channel_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channels') THEN
      UPDATE public.creator_earnings t SET profile_id = c.owner_id
      FROM public.channels c WHERE t.channel_id = c.id AND t.profile_id IS NULL;
    END IF;
    ALTER TABLE public.creator_earnings DROP COLUMN IF EXISTS channel_id;
    ALTER TABLE public.creator_earnings DROP CONSTRAINT IF EXISTS creator_earnings_channel_id_month_key;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='creator_earnings_profile_fk') THEN
      ALTER TABLE public.creator_earnings ADD CONSTRAINT creator_earnings_profile_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='creator_earnings_profile_month_key') THEN
      ALTER TABLE public.creator_earnings ADD CONSTRAINT creator_earnings_profile_month_key UNIQUE(profile_id, month);
    END IF;
  END IF;
END $$;

-- 8) scheduled_posts: channel_id -> profile_id (só se a tabela existir) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scheduled_posts') THEN
    DROP INDEX IF EXISTS public.sp_channel_idx;
    ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS profile_id UUID;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scheduled_posts' AND column_name='channel_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channels') THEN
      UPDATE public.scheduled_posts t SET profile_id = c.owner_id
      FROM public.channels c WHERE t.channel_id = c.id AND t.profile_id IS NULL;
    END IF;
    ALTER TABLE public.scheduled_posts DROP COLUMN IF EXISTS channel_id;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='scheduled_posts_profile_fk') THEN
      ALTER TABLE public.scheduled_posts ADD CONSTRAINT scheduled_posts_profile_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    CREATE INDEX IF NOT EXISTS scheduled_posts_profile_idx ON public.scheduled_posts(profile_id);
  END IF;
END $$;

-- 9) channel_watermark_settings -> profile_watermark_settings (se existir) ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channel_watermark_settings') THEN
    ALTER TABLE public.channel_watermark_settings ADD COLUMN IF NOT EXISTS profile_id UUID;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='channel_watermark_settings' AND column_name='channel_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channels') THEN
      UPDATE public.channel_watermark_settings t SET profile_id = c.owner_id
      FROM public.channels c WHERE t.channel_id = c.id AND t.profile_id IS NULL;
    END IF;
    ALTER TABLE public.channel_watermark_settings DROP COLUMN IF EXISTS channel_id;
    ALTER TABLE public.channel_watermark_settings ALTER COLUMN profile_id SET NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='profile_watermark_unique') THEN
      ALTER TABLE public.channel_watermark_settings ADD CONSTRAINT profile_watermark_unique UNIQUE(profile_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='profile_watermark_settings_profile_fk') THEN
      ALTER TABLE public.channel_watermark_settings ADD CONSTRAINT profile_watermark_settings_profile_fk FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    ALTER TABLE public.channel_watermark_settings RENAME TO profile_watermark_settings;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_watermark_settings TO authenticated;
    ALTER TABLE public.profile_watermark_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "watermark self all" ON public.profile_watermark_settings;
    CREATE POLICY "watermark self all" ON public.profile_watermark_settings
      FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
END $$;

-- 10) playlists: garantir que não sobra nenhuma coluna channel_id ────────
ALTER TABLE public.playlists DROP COLUMN IF EXISTS channel_id;

-- 11) Fundir channel_follows + channel_subscribers em follows (se existirem) ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channel_follows')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channels') THEN
    INSERT INTO public.follows (follower_id, target_username, created_at)
    SELECT cf.user_id, c.handle, cf.created_at
    FROM public.channel_follows cf
    JOIN public.channels c ON c.id = cf.channel_id
    WHERE c.handle IS NOT NULL
    ON CONFLICT (follower_id, target_username) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channel_subscribers')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='channels') THEN
    INSERT INTO public.follows (follower_id, target_username, created_at)
    SELECT cs.user_id, c.handle, cs.created_at
    FROM public.channel_subscribers cs
    JOIN public.channels c ON c.id = cs.channel_id
    WHERE c.handle IS NOT NULL
    ON CONFLICT (follower_id, target_username) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='followers_count') THEN
    UPDATE public.profiles p SET followers_count = (
      SELECT COUNT(*) FROM public.follows f WHERE f.target_username = p.username
    );
    UPDATE public.profiles p SET following_count = (
      SELECT COUNT(*) FROM public.follows f WHERE f.follower_id = p.id
    );
  END IF;
END $$;

-- 12) record_video_view: já não existe videos.channel_id — usa owner_id ──
DROP FUNCTION IF EXISTS public.record_video_view(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC);
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
  v_profile_id UUID;
  v_already BOOLEAN;
  v_threshold NUMERIC;
BEGIN
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'no_viewer_key');
  END IF;

  SELECT COALESCE(p_channel_id, owner_id) INTO v_profile_id FROM public.videos WHERE id = p_video_id;

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

  INSERT INTO public.video_views (video_id, profile_id, user_id, viewer_fingerprint, country, country_code, watch_seconds, viewed_at)
  VALUES (p_video_id, v_profile_id, v_uid, p_viewer_fingerprint, p_country, p_country_code, p_watch_seconds, now());

  UPDATE public.videos SET views_count = COALESCE(views_count, 0) + 1 WHERE id = p_video_id;

  RETURN jsonb_build_object('counted', true);
END;
$$;

-- 13) Apagar as tabelas agora redundantes ────────────────────────────────
DROP TABLE IF EXISTS public.channel_subscribers;
DROP TABLE IF EXISTS public.channel_follows;
DROP TABLE IF EXISTS public.channels;

-- 14) Grant nas novas colunas de profiles ────────────────────────────────
GRANT SELECT (banner_url, category, country) ON public.profiles TO authenticated, anon;
