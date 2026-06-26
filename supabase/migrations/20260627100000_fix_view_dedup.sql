-- ═══════════════════════════════════════════════════════════════════════
-- Fix: deduplicação de views — 1 view por utilizador autenticado por vídeo
--      e 1 view por fingerprint (IP+UA hash) por vídeo para anónimos
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Adicionar UNIQUE por (video_id, user_id) para evitar duplicados na BD
--    para utilizadores autenticados
ALTER TABLE public.video_views
  DROP CONSTRAINT IF EXISTS video_views_video_user_unique;

ALTER TABLE public.video_views
  ADD CONSTRAINT video_views_video_user_unique
  UNIQUE (video_id, user_id);

-- 2. Adicionar coluna viewer_fingerprint para anónimos (hash de IP+UA)
ALTER TABLE public.video_views
  ADD COLUMN IF NOT EXISTS viewer_fingerprint TEXT;

-- Índice para lookup rápido de fingerprint
CREATE INDEX IF NOT EXISTS vv_fingerprint_idx
  ON public.video_views (video_id, viewer_fingerprint)
  WHERE viewer_fingerprint IS NOT NULL;

-- 3. Recriar a função record_video_view com deduplicação real
CREATE OR REPLACE FUNCTION public.record_video_view(
  p_video_id          UUID,
  p_channel_id        UUID DEFAULT NULL,
  p_viewer_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_channel_id UUID;
  v_already    BOOLEAN := FALSE;
  v_cooldown   INTERVAL := INTERVAL '6 hours'; -- mesmo utilizador só conta de 6 em 6h
BEGIN
  -- Resolver channel_id
  SELECT COALESCE(p_channel_id, channel_id)
    INTO v_channel_id
    FROM public.videos
   WHERE id = p_video_id;

  -- ── Verificar se já existe view recente ──
  IF v_user_id IS NOT NULL THEN
    -- Utilizador autenticado: 1 view por vídeo a cada 6 horas
    SELECT EXISTS (
      SELECT 1 FROM public.video_views
       WHERE video_id = p_video_id
         AND user_id  = v_user_id
         AND viewed_at > now() - v_cooldown
    ) INTO v_already;
  ELSIF p_viewer_fingerprint IS NOT NULL THEN
    -- Anónimo: 1 view por fingerprint a cada 6 horas
    SELECT EXISTS (
      SELECT 1 FROM public.video_views
       WHERE video_id            = p_video_id
         AND viewer_fingerprint  = p_viewer_fingerprint
         AND viewed_at           > now() - v_cooldown
    ) INTO v_already;
  END IF;

  -- Se já viu recentemente, não conta
  IF v_already THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'cooldown');
  END IF;

  -- ── Inserir view ──
  INSERT INTO public.video_views (video_id, channel_id, user_id, viewer_fingerprint, viewed_at)
  VALUES (p_video_id, v_channel_id, v_user_id, p_viewer_fingerprint, now())
  ON CONFLICT (video_id, user_id)
    DO UPDATE SET viewed_at = now()  -- actualiza timestamp para reset do cooldown
    WHERE video_views.viewed_at < now() - v_cooldown;

  -- Se o INSERT/UPDATE não afectou nada (ON CONFLICT não passou o WHERE), já contou
  IF NOT FOUND THEN
    RETURN jsonb_build_object('counted', false, 'reason', 'conflict');
  END IF;

  -- ── Incrementar views_count no vídeo ──
  UPDATE public.videos
     SET views_count = COALESCE(views_count, 0) + 1
   WHERE id = p_video_id;

  RETURN jsonb_build_object('counted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_video_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_video_view TO anon;

-- 4. Recalcular views_count de todos os vídeos com base nos registos reais
--    (corrigir os valores inflacionados actuais)
UPDATE public.videos v
   SET views_count = (
     SELECT COUNT(DISTINCT COALESCE(user_id::TEXT, viewer_fingerprint, 'anon-' || id::TEXT))
       FROM public.video_views vv
      WHERE vv.video_id = v.id
   );
