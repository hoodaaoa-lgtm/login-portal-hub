-- ============================================================================
-- get_personalized_feed incluia rascunhos (is_draft = true) e publicacoes
-- agendadas para o futuro (scheduled_at) de TODOS os utilizadores no feed
-- publico -- um vazamento de conteudo do Studio que ainda nao devia ser
-- visivel a ninguem. Esta migration recria a funcao exatamente como em
-- 20260707180000_feed_ranking_engine.sql, so acrescentando o filtro que
-- faltava na CTE "candidates". Nenhuma outra logica foi alterada.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_personalized_feed(
  p_user_id UUID,
  p_cursor  TIMESTAMPTZ DEFAULT now(),
  p_limit   INTEGER DEFAULT 20
)
RETURNS TABLE (post_id UUID, rank_score NUMERIC, bucket TEXT)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  n1 INTEGER := GREATEST(1, ROUND(p_limit * 0.4));  -- interesses
  n2 INTEGER := GREATEST(1, ROUND(p_limit * 0.3));  -- seguidos
  n3 INTEGER := GREATEST(1, ROUND(p_limit * 0.2));  -- descoberta
  n4 INTEGER := GREATEST(1, p_limit - ROUND(p_limit*0.4) - ROUND(p_limit*0.3) - ROUND(p_limit*0.2)); -- tendencias
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.id,
      p.author_id,
      p.created_at,
      COALESCE(cq.quality_score, 60) AS quality,
      GREATEST(0, 100 - (EXTRACT(EPOCH FROM (now() - p.created_at)) / 259200.0 * 100)) AS freshness,
      COALESCE(ui.score, 0) AS interest_score,
      EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id = p_user_id AND f.following_id = p.author_id) AS is_followed,
      (SELECT COUNT(*) FROM public.posts p2 WHERE p2.author_id = p.author_id) AS author_post_count
    FROM public.posts p
    LEFT JOIN public.content_quality cq ON cq.post_id = p.id
    LEFT JOIN public.user_interests ui ON ui.user_id = p_user_id AND ui.author_id = p.author_id
    WHERE p.created_at < p_cursor
      AND p.author_id IS DISTINCT FROM p_user_id
      AND p.is_draft = false
      AND (p.scheduled_at IS NULL OR p.scheduled_at <= now())
    ORDER BY p.created_at DESC
    LIMIT 500
  ),
  scored AS (
    SELECT
      id, author_id, created_at, is_followed,
      (interest_score * 0.4 + quality * 0.35 + freshness * 0.20
        + (CASE WHEN author_post_count <= 5 THEN 15 ELSE 0 END)
      ) AS score_interest,
      (quality * 0.5 + freshness * 0.35 + interest_score * 0.15) AS score_followed,
      (quality * 0.4 + freshness * 0.2
        + (CASE WHEN author_post_count <= 5 THEN 40 ELSE GREATEST(0, 20 - author_post_count) END)
      ) AS score_discovery,
      (quality * 0.3 + freshness * 0.7) AS score_trending
    FROM candidates
  ),
  b1 AS (
    SELECT id, score_interest AS rank_score, 'interesses'::TEXT AS bucket
    FROM scored WHERE interest_score > 0
    ORDER BY score_interest DESC LIMIT n1
  ),
  b2 AS (
    SELECT id, score_followed AS rank_score, 'seguidos'::TEXT AS bucket
    FROM scored WHERE is_followed AND id NOT IN (SELECT id FROM b1)
    ORDER BY score_followed DESC LIMIT n2
  ),
  b3 AS (
    SELECT id, score_discovery AS rank_score, 'descoberta'::TEXT AS bucket
    FROM scored WHERE NOT is_followed AND id NOT IN (SELECT id FROM b1 UNION SELECT id FROM b2)
    ORDER BY score_discovery DESC LIMIT n3
  ),
  b4 AS (
    SELECT id, score_trending AS rank_score, 'tendencias'::TEXT AS bucket
    FROM scored WHERE id NOT IN (SELECT id FROM b1 UNION SELECT id FROM b2 UNION SELECT id FROM b3)
    ORDER BY score_trending DESC LIMIT n4
  ),
  combined AS (
    SELECT * FROM b1 UNION ALL SELECT * FROM b2 UNION ALL SELECT * FROM b3 UNION ALL SELECT * FROM b4
  ),
  filler AS (
    SELECT s.id, (s.quality * 0.5 + s.freshness * 0.5) AS rank_score, 'preenchimento'::TEXT AS bucket
    FROM scored s
    WHERE s.id NOT IN (SELECT id FROM combined)
    ORDER BY rank_score DESC
    LIMIT GREATEST(0, p_limit - (SELECT COUNT(*) FROM combined))
  )
  SELECT * FROM combined
  UNION ALL
  SELECT * FROM filler
  ORDER BY rank_score DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_personalized_feed(UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_personalized_feed(UUID, TIMESTAMPTZ, INTEGER) TO authenticated;
