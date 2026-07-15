-- ───────────────────────────────────────────────────────────────────────
-- Canais (estilo página do Facebook): um dono publica, outros seguem.
-- Cria as tabelas channels e channel_follows, liga posts.channel_id,
-- RPC channel_criar (username único), triggers para contadores.
-- ───────────────────────────────────────────────────────────────────────

-- ── Tabela channels ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username        TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  avatar_url      TEXT,
  cover_url       TEXT,
  category        TEXT NOT NULL DEFAULT 'Outro',
  is_adult        BOOLEAN NOT NULL DEFAULT false,
  followers_count INTEGER NOT NULL DEFAULT 0,
  posts_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT channels_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$')
);

CREATE INDEX IF NOT EXISTS idx_channels_owner_id ON public.channels(owner_id);
CREATE INDEX IF NOT EXISTS idx_channels_category ON public.channels(category);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels_select_all" ON public.channels
  FOR SELECT USING (true);

CREATE POLICY "channels_update_owner" ON public.channels
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "channels_delete_owner" ON public.channels
  FOR DELETE USING (owner_id = auth.uid());

-- Inserção só via RPC channel_criar (security definer) — sem policy de INSERT direta.

-- ── Tabela channel_follows ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.channel_follows (
  channel_id  UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_follows_user_id ON public.channel_follows(user_id);

ALTER TABLE public.channel_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_follows_select_all" ON public.channel_follows
  FOR SELECT USING (true);

CREATE POLICY "channel_follows_insert_self" ON public.channel_follows
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "channel_follows_delete_self" ON public.channel_follows
  FOR DELETE USING (user_id = auth.uid());

-- ── posts.channel_id — liga uma publicação a um canal ──────────────────
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_channel_id ON public.posts(channel_id) WHERE channel_id IS NOT NULL;

-- ── RPC: channel_criar — cria o canal já validando username único ──────
CREATE OR REPLACE FUNCTION public.channel_criar(
  p_username    TEXT,
  p_name        TEXT,
  p_avatar_url  TEXT DEFAULT NULL,
  p_cover_url   TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_category    TEXT DEFAULT 'Outro',
  p_is_adult    BOOLEAN DEFAULT false
)
RETURNS public.channels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel public.channels;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Precisas de iniciar sessão.';
  END IF;

  IF p_username IS NULL OR length(trim(p_username)) < 3 THEN
    RAISE EXCEPTION 'Username inválido.';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'O canal precisa de um nome.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.channels WHERE username = lower(trim(p_username))) THEN
    RAISE EXCEPTION 'Esse username já está a ser usado por outro canal.';
  END IF;

  INSERT INTO public.channels (owner_id, username, name, avatar_url, cover_url, description, category, is_adult)
  VALUES (auth.uid(), lower(trim(p_username)), trim(p_name), p_avatar_url, p_cover_url, NULLIF(trim(p_description), ''), COALESCE(p_category, 'Outro'), COALESCE(p_is_adult, false))
  RETURNING * INTO v_channel;

  RETURN v_channel;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.channel_criar(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_criar(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ── Triggers: manter followers_count e posts_count sincronizados ───────
CREATE OR REPLACE FUNCTION public.channel_follows_count_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.channels SET followers_count = followers_count + 1 WHERE id = NEW.channel_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.channels SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.channel_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_channel_follows_count ON public.channel_follows;
CREATE TRIGGER trg_channel_follows_count
AFTER INSERT OR DELETE ON public.channel_follows
FOR EACH ROW EXECUTE FUNCTION public.channel_follows_count_sync();

CREATE OR REPLACE FUNCTION public.channel_posts_count_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.channel_id IS NOT NULL THEN
      UPDATE public.channels SET posts_count = posts_count + 1 WHERE id = NEW.channel_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.channel_id IS NOT NULL THEN
      UPDATE public.channels SET posts_count = GREATEST(0, posts_count - 1) WHERE id = OLD.channel_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_channel_posts_count ON public.posts;
CREATE TRIGGER trg_channel_posts_count
AFTER INSERT OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.channel_posts_count_sync();
