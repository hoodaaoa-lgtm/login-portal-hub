-- ============================================================================
-- Feed inteligente para vídeos — mesma lógica de "nunca repetir" que já
-- existe para posts (get_personalized_feed_v2 + p_exclude_ids), agora
-- aplicada aos vídeos publicados nos canais/perfis.
--
-- Problema: o feed buscava vídeos direto da tabela `videos` só por
-- created_at DESC, sem qualquer exclusão — por isso o vídeo mais recente
-- aparecia sempre no topo, sempre igual, ao atualizar a página, sair e
-- voltar, etc. (os posts já não tinham este problema, só os vídeos).
--
-- Esta função:
--   1) Exclui vídeos já registados em video_views para este utilizador
--      (sinal real e persistente — o utilizador já viu o vídeo a sério).
--   2) Exclui p_exclude_ids (vídeos já mostrados neste dispositivo nesta
--      sessão, via localStorage no cliente — mesmo padrão do feedSeen.ts).
--   3) Acrescenta um jitter aleatório pequeno ao score de frescura, para
--      que mesmo o primeiro carregamento (sem histórico ainda) não seja
--      sempre exatamente a mesma ordem determinística.
--   4) Resgate: se não sobrar nada de novo, volta a trazer vídeos já
--      vistos, começando pelos que há mais tempo não aparecem.
-- Idempotente — seguro correr mais que uma vez.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_feed_videos(
  p_user_id     UUID,
  p_cursor      TIMESTAMPTZ DEFAULT now(),
  p_limit       INTEGER DEFAULT 10,
  p_exclude_ids UUID[]  DEFAULT '{}'::UUID[]
)
RETURNS TABLE (video_id UUID, rank_score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH seen AS (
    -- Já visto a sério (video_views, sinal persistente entre sessões) +
    -- já mostrado neste dispositivo agora mesmo (p_exclude_ids).
    SELECT vv.video_id, vv.viewed_at AS seen_at
    FROM public.video_views vv
    WHERE vv.user_id = p_user_id
    UNION
    SELECT x.id, now() - INTERVAL '1 second'
    FROM unnest(p_exclude_ids) AS x(id)
  ),
  candidates AS (
    SELECT
      v.id,
      v.created_at,
      -- Frescura 0-100 (mesma escala/curva usada para posts) + jitter
      -- aleatório pequeno para variar a ordem entre atualizações, mesmo
      -- quando não há ainda nenhum sinal de "visto".
      GREATEST(0, 100 - (EXTRACT(EPOCH FROM (now() - v.created_at)) / 259200.0 * 100))
        + (random() * 12 - 6) AS score
    FROM public.videos v
    WHERE v.status = 'published'
      AND v.visibility = 'public'
      AND v.owner_id IS DISTINCT FROM p_user_id
      AND v.created_at < p_cursor
      AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.video_id = v.id)
  ),
  primary_result AS (
    SELECT id AS video_id, score AS rank_score
    FROM candidates
    ORDER BY score DESC
    LIMIT p_limit
  ),
  -- Resgate: só entra se já não houver vídeo novo suficiente — traz de
  -- volta vídeos já vistos, começando pelos que há mais tempo não aparecem.
  resurface AS (
    SELECT
      v.id AS video_id,
      (GREATEST(0, 100 - (EXTRACT(EPOCH FROM (now() - v.created_at)) / 259200.0 * 100)) * 0.3
        + LEAST(40, EXTRACT(EPOCH FROM (now() - s.seen_at)) / 86400.0)
      ) AS rank_score
    FROM public.videos v
    JOIN seen s ON s.video_id = v.id
    WHERE v.status = 'published'
      AND v.visibility = 'public'
      AND v.owner_id IS DISTINCT FROM p_user_id
      AND v.created_at < p_cursor
    ORDER BY s.seen_at ASC
    LIMIT GREATEST(0, p_limit - (SELECT COUNT(*) FROM primary_result))
  )
  SELECT * FROM primary_result
  UNION ALL
  SELECT * FROM resurface
  ORDER BY rank_score DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_feed_videos(UUID, TIMESTAMPTZ, INTEGER, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feed_videos(UUID, TIMESTAMPTZ, INTEGER, UUID[]) TO authenticated;

-- Fim.
