-- ═══════════════════════════════════════════════════════════════════════
-- DROPS — conteúdo temporário estilo feed (só para seguidores)
--   • Expira automaticamente após 6h / 12h / 24h / 48h
--   • Visível apenas ao autor e a quem o segue
--   • Contadores (likes, comentários, reposts, shares, views) via triggers
--   • Realtime para atualização automática do feed
-- ═══════════════════════════════════════════════════════════════════════

-- ── Tabela principal ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.drops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_username TEXT NOT NULL DEFAULT '',
  content_type    TEXT NOT NULL CHECK (content_type IN ('photo','video','text','music')),
  content_url     TEXT,
  text_content    TEXT,
  music_url       TEXT,
  music_title     TEXT,
  aspect_ratio    REAL,
  duration_hours  INTEGER NOT NULL DEFAULT 24 CHECK (duration_hours IN (6,12,24,48)),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  likes_count     INTEGER NOT NULL DEFAULT 0,
  comments_count  INTEGER NOT NULL DEFAULT 0,
  reposts_count   INTEGER NOT NULL DEFAULT 0,
  shares_count    INTEGER NOT NULL DEFAULT 0,
  views_count     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS drops_created_idx  ON public.drops(created_at DESC);
CREATE INDEX IF NOT EXISTS drops_expires_idx  ON public.drops(expires_at);
CREATE INDEX IF NOT EXISTS drops_author_idx   ON public.drops(author_username);
CREATE INDEX IF NOT EXISTS drops_user_idx     ON public.drops(user_id);
-- Caso a tabela já exista de uma execução anterior, garante a coluna de aspeto
ALTER TABLE public.drops ADD COLUMN IF NOT EXISTS aspect_ratio REAL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drops TO authenticated;
GRANT ALL ON public.drops TO service_role;
ALTER TABLE public.drops ENABLE ROW LEVEL SECURITY;

-- Só o autor ou os seguidores veem o drop, e apenas enquanto não expirar
CREATE POLICY "drops read followers" ON public.drops FOR SELECT TO authenticated
USING (
  expires_at > now() AND (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = auth.uid()
        AND f.target_username = drops.author_username
    )
  )
);
CREATE POLICY "drops insert own" ON public.drops FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "drops update own" ON public.drops FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "drops delete own" ON public.drops FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Preenche author_username e expires_at automaticamente a partir do perfil/duração
CREATE OR REPLACE FUNCTION public.set_drop_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.author_username IS NULL OR NEW.author_username = '' THEN
    SELECT username INTO NEW.author_username FROM public.profiles WHERE id = NEW.user_id;
  END IF;
  NEW.expires_at := COALESCE(NEW.created_at, now()) + (NEW.duration_hours || ' hours')::interval;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_drop_defaults ON public.drops;
CREATE TRIGGER trg_set_drop_defaults BEFORE INSERT ON public.drops
  FOR EACH ROW EXECUTE FUNCTION public.set_drop_defaults();

-- ── Interações (like / repost / share / view) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.drop_interactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id          UUID NOT NULL REFERENCES public.drops(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('like','repost','share','view')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drop_id, user_id, interaction_type)
);
CREATE INDEX IF NOT EXISTS drop_int_drop_idx ON public.drop_interactions(drop_id);
CREATE INDEX IF NOT EXISTS drop_int_user_idx ON public.drop_interactions(user_id);

GRANT SELECT, INSERT, DELETE ON public.drop_interactions TO authenticated;
GRANT ALL ON public.drop_interactions TO service_role;
ALTER TABLE public.drop_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drop_int read" ON public.drop_interactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "drop_int insert own" ON public.drop_interactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "drop_int delete own" ON public.drop_interactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── Comentários ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.drop_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id         UUID NOT NULL REFERENCES public.drops(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_username TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drop_comments_drop_idx ON public.drop_comments(drop_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.drop_comments TO authenticated;
GRANT ALL ON public.drop_comments TO service_role;
ALTER TABLE public.drop_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drop_comments read" ON public.drop_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "drop_comments insert own" ON public.drop_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "drop_comments delete own" ON public.drop_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── Triggers de contagem ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.drop_interaction_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  col TEXT;
  delta INTEGER;
  target UUID;
  itype TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := 1; target := NEW.drop_id; itype := NEW.interaction_type;
  ELSE
    delta := -1; target := OLD.drop_id; itype := OLD.interaction_type;
  END IF;

  col := CASE itype
    WHEN 'like'   THEN 'likes_count'
    WHEN 'repost' THEN 'reposts_count'
    WHEN 'share'  THEN 'shares_count'
    WHEN 'view'   THEN 'views_count'
  END;

  IF col IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.drops SET %I = GREATEST(0, %I + $1) WHERE id = $2', col, col
    ) USING delta, target;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_drop_interaction_count ON public.drop_interactions;
CREATE TRIGGER trg_drop_interaction_count
  AFTER INSERT OR DELETE ON public.drop_interactions
  FOR EACH ROW EXECUTE FUNCTION public.drop_interaction_count();

CREATE OR REPLACE FUNCTION public.drop_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.drops SET comments_count = comments_count + 1 WHERE id = NEW.drop_id;
  ELSE
    UPDATE public.drops SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.drop_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_drop_comment_count ON public.drop_comments;
CREATE TRIGGER trg_drop_comment_count
  AFTER INSERT OR DELETE ON public.drop_comments
  FOR EACH ROW EXECUTE FUNCTION public.drop_comment_count();

-- ── Limpeza de drops expirados (chamável pelo cliente) ───────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_drops()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.drops WHERE expires_at < now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_drops() TO authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────
ALTER TABLE public.drops REPLICA IDENTITY FULL;
ALTER TABLE public.drop_interactions REPLICA IDENTITY FULL;
ALTER TABLE public.drop_comments REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.drops;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.drop_interactions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.drop_comments;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
