-- ═══════════════════════════════════════════════════════════
-- Fix: views únicas por utilizador — só conta 1 view por
-- utilizador por vídeo a cada 24 horas.
-- Utilizadores anónimos: 1 view por vídeo por sessão (sem
-- controlo no backend — o frontend usa sessionStorage).
-- ═══════════════════════════════════════════════════════════

-- 1 — Índice para lookup rápido de views recentes
CREATE INDEX IF NOT EXISTS vv_user_video_time_idx
  ON public.video_views (video_id, user_id, viewed_at)
  WHERE user_id IS NOT NULL;

-- 2 — Recriar a função com lógica de deduplicação
CREATE OR REPLACE FUNCTION public.record_video_view(
  p_video_id   UUID,
  p_channel_id UUID DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_channel_id UUID;
  v_already    BOOLEAN := false;
BEGIN
  -- Resolve channel_id se não foi passado
  SELECT COALESCE(p_channel_id, channel_id)
    INTO v_channel_id
    FROM public.videos
   WHERE id = p_video_id;

  -- Para utilizadores autenticados: só conta se não viu nas últimas 24h
  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.video_views
       WHERE video_id  = p_video_id
         AND user_id   = v_user_id
         AND viewed_at > now() - INTERVAL '24 hours'
    ) INTO v_already;

    IF v_already THEN
      RETURN jsonb_build_object('counted', false, 'reason', 'already_viewed_24h');
    END IF;
  END IF;

  -- Incrementa o contador
  UPDATE public.videos
     SET views_count = COALESCE(views_count, 0) + 1
   WHERE id = p_video_id;

  -- Regista a view
  INSERT INTO public.video_views (video_id, channel_id, user_id, viewed_at)
  VALUES (p_video_id, v_channel_id, v_user_id, now())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('counted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_video_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_video_view TO anon;
