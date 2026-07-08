-- ============================================================================
-- Fase 4b — Feed nunca repete publicações já mostradas
--
-- Problema: ao atualizar a página, o algoritmo de ranking (afinidade +
-- qualidade + frescura) é praticamente determinístico num curto espaço de
-- tempo — nada mudou entretanto, por isso devolvia sempre o mesmo top de
-- publicações.
--
-- Agora get_personalized_feed passa a receber p_exclude_ids (publicações já
-- mostradas nesta sessão/dispositivo, mesmo sem terem sido "vistas" a
-- sério) e cruza isso com post_impressions (publicações em que o
-- utilizador esteve mesmo parado — sinal mais forte, persistente entre
-- sessões e dispositivos). As duas fontes são excluídas do lote principal.
--
-- Para o feed nunca ficar vazio quando já não há nada de novo por mostrar,
-- há um "resgate" no fim: volta a trazer publicações já vistas, mas
-- começando pelas que há mais tempo não aparecem — nunca as mesmas duas
-- vezes seguidas, e só como último recurso.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_personalized_feed(UUID, TIMESTAMPTZ, INTEGER);

CREATE OR REPLACE FUNCTION public.get_personalized_feed(
  p_user_id     UUID,
  p_cursor      TIMESTAMPTZ DEFAULT now(),
  p_limit       INTEGER DEFAULT 20,
  p_exclude_ids UUID[]  DEFAULT '{}'::UUID[]
)
RETURNS TABLE (post_id UUID, rank_score NUMERIC, bucket TEXT)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  n1 INTEGER := GREATEST(1, ROUND(p_limit * 0.4));  -- interesses
  n2 INTEGER := GREATEST(1, ROUND(p_limit * 0.3));  -- seguidos
  n3 INTEGER := GREATEST(1, ROUND(p_limit * 0.2));  -- descoberta
  n4 INTEGER := GREATEST(1, p_limit - ROUND(p_limit*0.4) - ROUND(p_limit*0.3) - ROUND(p_limit*0.2)); -- tendências
BEGIN
  RETURN QUERY
  WITH seen AS (
    -- União de duas fontes de "já mostrado":
    --  1) post_impressions — o utilizador ficou mesmo a olhar (sinal forte,
    --     entre sessões/dispositivos).
    --  2) p_exclude_ids — publicações que já apareceram no ecrã nesta
    --     sessão/dispositivo, mesmo que só de relance (evita repetir ao
    --     atualizar a página segundos depois).
    SELECT pi.post_id, pi.created_at AS seen_at
    FROM public.post_impressions pi
    WHERE pi.user_id = p_user_id
    UNION
    SELECT x.id, now() - INTERVAL '1 second'  -- assume "visto agora" para ordenar por último
    FROM unnest(p_exclude_ids) AS x(id)
  ),
  candidates AS (
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
      AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.post_id = p.id)
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
  ),
  primary_result AS (
    SELECT * FROM combined
    UNION ALL
    SELECT * FROM filler
  ),
  -- Resgate: só entra em ação se, mesmo depois de tudo o resto, ainda faltar
  -- para preencher p_limit — ou seja, o utilizador já viu tudo o que havia
  -- de novo. Traz de volta publicações antigas, priorizando sempre as que
  -- há mais tempo não aparecem (nunca as últimas vistas).
  resurface AS (
    SELECT
      p.id,
      (COALESCE(cq.quality_score, 60) * 0.5
        + GREATEST(0, 100 - (EXTRACT(EPOCH FROM (now() - p.created_at)) / 259200.0 * 100)) * 0.2
        + LEAST(30, EXTRACT(EPOCH FROM (now() - s.seen_at)) / 86400.0)
      ) AS rank_score,
      'repescagem'::TEXT AS bucket
    FROM public.posts p
    JOIN seen s ON s.post_id = p.id
    LEFT JOIN public.content_quality cq ON cq.post_id = p.id
    WHERE p.created_at < p_cursor
      AND p.author_id IS DISTINCT FROM p_user_id
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

REVOKE EXECUTE ON FUNCTION public.get_personalized_feed(UUID, TIMESTAMPTZ, INTEGER, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_personalized_feed(UUID, TIMESTAMPTZ, INTEGER, UUID[]) TO authenticated;

-- Fim.
