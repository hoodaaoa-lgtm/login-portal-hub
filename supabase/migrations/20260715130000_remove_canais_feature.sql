-- ───────────────────────────────────────────────────────────────────────
-- Remove por completo a feature de Canais (channels/channel_follows),
-- introduzida em 20260715120000_criar_canais.sql.
-- ───────────────────────────────────────────────────────────────────────

-- ── Triggers ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_channel_posts_count ON public.posts;
DROP TRIGGER IF EXISTS trg_channel_follows_count ON public.channel_follows;

DROP FUNCTION IF EXISTS public.channel_posts_count_sync();
DROP FUNCTION IF EXISTS public.channel_follows_count_sync();

-- ── RPC ─────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.channel_criar(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

-- ── Coluna em posts ─────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_posts_channel_id;
ALTER TABLE public.posts DROP COLUMN IF EXISTS channel_id;

-- ── Tabelas ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.channel_follows;
DROP TABLE IF EXISTS public.channels;
