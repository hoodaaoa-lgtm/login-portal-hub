-- ═══════════════════════════════════════════════════════════════════════
-- Limpeza: get_feed_clips ficou órfã depois da migração
-- 20260708140000_remove_channels_use_profiles.sql — ela faz JOIN em
-- public.channels (apagada) e lê posts.channel_id (coluna apagada), então
-- quebraria com erro de SQL se fosse chamada. Confirmado por busca no
-- frontend (src/) que não há nenhuma chamada a esta função — está morta.
-- Removida em vez de corrigida: o conceito de "clipe com dados de canal"
-- já não existe separado de "post com clip_video_id" + dados do autor.
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_feed_clips(INT, INT);
