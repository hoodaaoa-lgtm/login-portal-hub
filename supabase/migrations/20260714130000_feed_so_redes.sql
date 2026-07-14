-- ───────────────────────────────────────────────────────────────────────
-- Agora que publicar é sempre feito dentro de uma Rede (perfil deixou de
-- publicar directamente), o feed personalizado deve mostrar apenas posts
-- ligados a uma Rede (rede_id IS NOT NULL). Publicações antigas feitas
-- direto pelo perfil (rede_id NULL) deixam de aparecer no feed — os dados
-- continuam guardados na base de dados, só deixam de ser distribuídos.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_personalized_feed_v3(
  p_user_id             UUID,
  p_cursor              TIMESTAMPTZ DEFAULT now(),
  p_limit               INTEGER DEFAULT 20,
  p_exclude_ids         UUID[]  DEFAULT '{}'::UUID[],
  p_hard_exclude_hours  INTEGER DEFAULT 24
)
RETURNS TABLE (post_id UUID, rank_score NUMERIC, bucket TEXT, author_id UUID, top_category TEXT)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_settings RECORD;
  v_total    NUMERIC;
  n1 INTEGER; n2 INTEGER; n3 INTEGER; n4 INTEGER; n5 INTEGER;
  v_taste vector(768);
  v_overfetch INTEGER := GREATEST(p_limit * 3, 30);
BEGIN
  SELECT * INTO v_settings FROM public.algorithm_settings WHERE id = 1;
  IF NOT FOUND THEN
    v_settings := ROW(1, 25, 35, 20, 10, 10, 3, 4, 5, 4, 40, now(), NULL)::public.algorithm_settings;
  END IF;

  v_total := GREATEST(1, v_settings.weight_interesses + v_settings.weight_seguidores
    + v_settings.weight_similaridade + v_settings.weight_descoberta + v_settings.weight_tendencias);

  n1 := GREATEST(1, ROUND(p_limit * (v_settings.weight_interesses / v_total)));
  n2 := GREATEST(1, ROUND(p_limit * (v_settings.weight_seguidores / v_total)));
  n3 := GREATEST(1, ROUND(p_limit * (v_settings.weight_similaridade / v_total)));
  n4 := GREATEST(1, ROUND(p_limit * (v_settings.weight_descoberta / v_total)));
  n5 := GREATEST(1, p_limit - n1 - n2 - n3 - n4);

  SELECT embedding INTO v_taste FROM public.user_taste_vectors WHERE user_id = p_user_id;

  RETURN QUERY
  WITH seen AS (
    SELECT pi.post_id, pi.created_at AS seen_at
    FROM public.post_impressions pi
    WHERE pi.user_id = p_user_id
      AND pi.created_at > now() - (p_hard_exclude_hours || ' hours')::INTERVAL
    UNION
    SELECT x.id, now() - INTERVAL '1 second'
    FROM unnest(p_exclude_ids) AS x(id)
  ),
  candidates AS (
    SELECT
      p.id,
      p.author_id,
      p.created_at,
      p.embedding,
      COALESCE(cq.quality_score, 60) AS quality,
      GREATEST(0, 100 - (EXTRACT(EPOCH FROM (now() - p.created_at)) / 259200.0 * 100)) AS freshness,
      COALESCE(ui.score, 0) AS interest_score,
      EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id = p_user_id AND f.following_id = p.author_id) AS is_followed,
      (SELECT COUNT(*) FROM public.posts p2 WHERE p2.author_id = p.author_id) AS author_post_count,
      CASE
        WHEN v_taste IS NOT NULL AND p.embedding IS NOT NULL
          THEN GREATEST(0, (1 - (p.embedding <=> v_taste)) * 100)
        ELSE 0
      END AS similarity,
      COALESCE((pc.categories -> 0 ->> 'slug'), 'geral') AS top_category
    FROM public.posts p
    LEFT JOIN public.content_quality cq ON cq.post_id = p.id
    LEFT JOIN public.user_interests ui ON ui.user_id = p_user_id AND ui.author_id = p.author_id
    LEFT JOIN public.post_classifications pc ON pc.post_id = p.id
    WHERE p.created_at < p_cursor
      AND p.author_id IS DISTINCT FROM p_user_id
      AND p.rede_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.post_id = p.id)
    ORDER BY p.created_at DESC
    LIMIT 500
  ),
  scored AS (
    SELECT
      id, author_id, created_at, is_followed, top_category,
      (interest_score * 0.30 + quality * 0.25 + freshness * 0.15 + similarity * 0.30
        + (CASE WHEN author_post_count <= 5 THEN 10 ELSE 0 END)
      ) AS score_interest,
      (quality * 0.40 + freshness * 0.30 + interest_score * 0.10 + similarity * 0.20) AS score_followed,
      (similarity * 0.70 + quality * 0.20 + freshness * 0.10) AS score_similaridade,
      (quality * 0.35 + freshness * 0.15
        + (CASE WHEN author_post_count <= 5 THEN 40 ELSE GREATEST(0, 20 - author_post_count) END)
      ) AS score_discovery,
      (quality * 0.3 + freshness * 0.7) AS score_trending
    FROM candidates
  ),
  b1 AS (
    SELECT id, author_id, top_category, score_interest AS rank_score, 'interesses'::TEXT AS bucket
    FROM scored WHERE score_interest > 0
    ORDER BY score_interest DESC LIMIT n1
  ),
  b2 AS (
    SELECT id, author_id, top_category, score_followed AS rank_score, 'seguidos'::TEXT AS bucket
    FROM scored WHERE is_followed AND id NOT IN (SELECT id FROM b1)
    ORDER BY score_followed DESC LIMIT n2
  ),
  b3 AS (
    SELECT id, author_id, top_category, score_similaridade AS rank_score, 'similaridade'::TEXT AS bucket
    FROM scored WHERE id NOT IN (SELECT id FROM b1 UNION SELECT id FROM b2)
    ORDER BY score_similaridade DESC LIMIT n3
  ),
  b4 AS (
    SELECT id, author_id, top_category, score_discovery AS rank_score, 'descoberta'::TEXT AS bucket
    FROM scored WHERE NOT is_followed AND id NOT IN (SELECT id FROM b1 UNION SELECT id FROM b2 UNION SELECT id FROM b3)
    ORDER BY score_discovery DESC LIMIT n4
  ),
  b5 AS (
    SELECT id, author_id, top_category, score_trending AS rank_score, 'tendencias'::TEXT AS bucket
    FROM scored WHERE id NOT IN (SELECT id FROM b1 UNION SELECT id FROM b2 UNION SELECT id FROM b3 UNION SELECT id FROM b4)
    ORDER BY score_trending DESC LIMIT n5
  ),
  combined AS (
    SELECT * FROM b1 UNION ALL SELECT * FROM b2 UNION ALL SELECT * FROM b3 UNION ALL SELECT * FROM b4 UNION ALL SELECT * FROM b5
  ),
  filler AS (
    SELECT s.id, s.author_id, s.top_category, (s.score_interest * 0.4 + s.score_trending * 0.6) AS rank_score, 'preenchimento'::TEXT AS bucket
    FROM scored s
    WHERE s.id NOT IN (SELECT id FROM combined)
    ORDER BY rank_score DESC
    LIMIT GREATEST(0, v_overfetch - (SELECT COUNT(*) FROM combined))
  ),
  primary_result AS (
    SELECT * FROM combined
    UNION ALL
    SELECT * FROM filler
  ),
  resurface AS (
    SELECT
      p.id, p.author_id, COALESCE((pc.categories -> 0 ->> 'slug'), 'geral') AS top_category,
      (COALESCE(cq.quality_score, 60) * 0.5
        + GREATEST(0, 100 - (EXTRACT(EPOCH FROM (now() - p.created_at)) / 259200.0 * 100)) * 0.2
        + LEAST(30, EXTRACT(EPOCH FROM (now() - s.seen_at)) / 86400.0)
      ) AS rank_score,
      'repescagem'::TEXT AS bucket
    FROM public.posts p
    JOIN seen s ON s.post_id = p.id
    LEFT JOIN public.content_quality cq ON cq.post_id = p.id
    LEFT JOIN public.post_classifications pc ON pc.post_id = p.id
    WHERE p.created_at < p_cursor
      AND p.author_id IS DISTINCT FROM p_user_id
      AND p.rede_id IS NOT NULL
    ORDER BY s.seen_at ASC
    LIMIT GREATEST(0, v_overfetch - (SELECT COUNT(*) FROM primary_result))
  ),
  pool AS (
    SELECT * FROM primary_result
    UNION ALL
    SELECT * FROM resurface
    ORDER BY rank_score DESC
    LIMIT v_overfetch
  )
  SELECT d.post_id, d.rank_score, d.bucket, d.author_id, d.top_category
  FROM public.diversificar_feed(
    (SELECT array_agg(ROW(pool.id, pool.rank_score, pool.bucket, pool.author_id, pool.top_category)::public.feed_item ORDER BY pool.rank_score DESC) FROM pool)
  ) AS d
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_personalized_feed_v3(UUID, TIMESTAMPTZ, INTEGER, UUID[], INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_personalized_feed_v3(UUID, TIMESTAMPTZ, INTEGER, UUID[], INTEGER) TO authenticated;
