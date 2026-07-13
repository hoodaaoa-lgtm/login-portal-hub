-- ============================================================================
-- Centro de IA — pesos configuráveis pelo admin + estados de distribuição
-- + RPCs de dashboard/análise de conteúdo para o painel administrativo.
--
-- O motor de ranking (get_personalized_feed_v2) e o cálculo de qualidade
-- (recompute_content_quality) já existiam com pesos FIXOS no código SQL.
-- Esta migração:
--   1) Cria `algorithm_settings` (linha única) com os pesos que o pedido
--      do admin quer poder ajustar sem tocar em código: composição do
--      feed (seguidores/IA/descoberta) e pesos de engajamento
--      (curtidas/comentários/partilhas/retenção).
--   2) Cria get_personalized_feed_v3, que lê os pesos de composição de
--      `algorithm_settings` em vez de constantes fixas (mantém toda a
--      lógica de v2 — embeddings, anti-fadiga, resgate — intacta).
--   3) Atualiza recompute_content_quality para ler os pesos de
--      engajamento de `algorithm_settings`.
--   4) Adiciona `posts.distribution_state` com os 7 estados pedidos e
--      uma função que os recalcula a partir do percentil de qualidade
--      entre publicações recentes + idade da publicação.
--   5) RPCs SECURITY DEFINER (só admin) para o dashboard do Centro de IA:
--      get_ai_dashboard_stats, get_ai_content_analysis.
-- Idempotente — seguro correr mais que uma vez.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────
-- 1. Configurações do algoritmo — linha única, editável só pelo admin.
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.algorithm_settings (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- força linha única
  weight_seguidores     NUMERIC NOT NULL DEFAULT 25,
  weight_interesses     NUMERIC NOT NULL DEFAULT 35,
  weight_similaridade   NUMERIC NOT NULL DEFAULT 20,
  weight_descoberta     NUMERIC NOT NULL DEFAULT 10,
  weight_tendencias     NUMERIC NOT NULL DEFAULT 10,
  weight_curtidas       NUMERIC NOT NULL DEFAULT 3,
  weight_comentarios    NUMERIC NOT NULL DEFAULT 4,
  weight_partilhas      NUMERIC NOT NULL DEFAULT 5,
  weight_guardados      NUMERIC NOT NULL DEFAULT 4,
  weight_retencao       NUMERIC NOT NULL DEFAULT 40,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.algorithm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.algorithm_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.algorithm_settings TO authenticated;
GRANT ALL ON public.algorithm_settings TO service_role;

DROP POLICY IF EXISTS "algorithm_settings admin read" ON public.algorithm_settings;
CREATE POLICY "algorithm_settings admin read" ON public.algorithm_settings
  FOR SELECT TO authenticated USING ( public.is_hooda_admin() );

DROP POLICY IF EXISTS "algorithm_settings admin write" ON public.algorithm_settings;
CREATE POLICY "algorithm_settings admin write" ON public.algorithm_settings
  FOR UPDATE TO authenticated
  USING ( public.is_hooda_admin() )
  WITH CHECK ( public.is_hooda_admin() );

CREATE OR REPLACE FUNCTION public.admin_update_algorithm_weights(
  p_weight_seguidores    NUMERIC,
  p_weight_interesses    NUMERIC,
  p_weight_similaridade  NUMERIC,
  p_weight_descoberta    NUMERIC,
  p_weight_tendencias    NUMERIC,
  p_weight_curtidas      NUMERIC,
  p_weight_comentarios   NUMERIC,
  p_weight_partilhas     NUMERIC,
  p_weight_guardados     NUMERIC,
  p_weight_retencao      NUMERIC
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'apenas administradores podem alterar os pesos do algoritmo';
  END IF;

  UPDATE public.algorithm_settings SET
    weight_seguidores   = GREATEST(0, p_weight_seguidores),
    weight_interesses   = GREATEST(0, p_weight_interesses),
    weight_similaridade = GREATEST(0, p_weight_similaridade),
    weight_descoberta   = GREATEST(0, p_weight_descoberta),
    weight_tendencias   = GREATEST(0, p_weight_tendencias),
    weight_curtidas     = GREATEST(0, p_weight_curtidas),
    weight_comentarios  = GREATEST(0, p_weight_comentarios),
    weight_partilhas    = GREATEST(0, p_weight_partilhas),
    weight_guardados    = GREATEST(0, p_weight_guardados),
    weight_retencao     = LEAST(100, GREATEST(0, p_weight_retencao)),
    updated_at          = now(),
    updated_by          = auth.uid()
  WHERE id = 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_update_algorithm_weights(NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_algorithm_weights(NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 2. recompute_content_quality passa a ler os pesos de engajamento de
--    algorithm_settings em vez de constantes fixas.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_content_quality(p_post_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post              RECORD;
  v_settings          RECORD;
  v_avg_dwell_ms       NUMERIC;
  v_impressions        INTEGER;
  v_hidden_count        INTEGER;
  v_saves_count         INTEGER;
  v_engagement_rate     NUMERIC;
  v_retention_score     NUMERIC;
  v_engagement          NUMERIC;
  v_originality         NUMERIC;
  v_satisfaction        NUMERIC;
  v_technical           NUMERIC;
  v_final               NUMERIC;
BEGIN
  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings FROM public.algorithm_settings WHERE id = 1;
  IF NOT FOUND THEN
    v_settings := ROW(1, 25, 35, 20, 10, 10, 3, 4, 5, 4, 40, now(), NULL)::public.algorithm_settings;
  END IF;

  SELECT COUNT(*) INTO v_saves_count FROM public.post_saves WHERE post_id = p_post_id;

  v_engagement_rate := (
    COALESCE(v_post.likes_count, 0) * v_settings.weight_curtidas
    + COALESCE(v_post.comments_count, 0) * v_settings.weight_comentarios
    + COALESCE(v_post.reposts_count, 0) * v_settings.weight_partilhas
    + COALESCE(v_post.quotes_count, 0) * v_settings.weight_partilhas
    + COALESCE(v_post.replies_count, 0) * v_settings.weight_comentarios
    + COALESCE(v_saves_count, 0) * v_settings.weight_guardados
  )::NUMERIC / GREATEST(COALESCE(v_post.views_count, 0), 1);
  v_engagement_rate := LEAST(100, v_engagement_rate * 200);

  SELECT AVG(dwell_ms), COUNT(*) INTO v_avg_dwell_ms, v_impressions
  FROM public.post_impressions WHERE post_id = p_post_id;
  v_retention_score := LEAST(100, COALESCE(v_avg_dwell_ms, 0) / 12000.0 * 100);

  IF COALESCE(v_impressions, 0) >= 3 THEN
    v_engagement := (v_engagement_rate * (1 - v_settings.weight_retencao / 100.0))
                  + (v_retention_score * (v_settings.weight_retencao / 100.0));
  ELSE
    v_engagement := v_engagement_rate;
  END IF;

  v_originality := 100;
  IF v_post.shared_from_post_id IS NOT NULL THEN
    v_originality := 45;
  END IF;
  IF v_post.moderation_status = 'spam' THEN
    v_originality := 0;
  END IF;

  SELECT COUNT(*) INTO v_hidden_count FROM public.post_hidden WHERE post_id = p_post_id;
  v_satisfaction := 100 - LEAST(100, (v_hidden_count::NUMERIC / GREATEST(COALESCE(v_post.views_count, 0), 1)) * 500);
  IF v_post.is_sensitive THEN
    v_satisfaction := v_satisfaction - 15;
  END IF;
  v_satisfaction := GREATEST(0, v_satisfaction);

  v_technical := COALESCE((SELECT quality_technical FROM public.content_quality WHERE post_id = p_post_id), 70);

  v_final := (v_technical * 0.25) + (v_engagement * 0.35) + (v_originality * 0.20) + (v_satisfaction * 0.20);

  INSERT INTO public.content_quality (post_id, quality_technical, quality_engagement, quality_originality, quality_satisfaction, quality_score, computed_at)
  VALUES (p_post_id, v_technical, v_engagement, v_originality, v_satisfaction, v_final, now())
  ON CONFLICT (post_id) DO UPDATE SET
    quality_engagement   = EXCLUDED.quality_engagement,
    quality_originality  = EXCLUDED.quality_originality,
    quality_satisfaction = EXCLUDED.quality_satisfaction,
    quality_score        = EXCLUDED.quality_score,
    computed_at          = now();

  PERFORM public.recompute_distribution_state(p_post_id);

  RETURN v_final;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recompute_content_quality(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_content_quality(UUID) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Estados de distribuição por publicação.
-- ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS distribution_state TEXT NOT NULL DEFAULT 'em_analise';

DO $$
BEGIN
  ALTER TABLE public.posts ADD CONSTRAINT posts_distribution_state_check
    CHECK (distribution_state IN (
      'em_analise', 'em_teste', 'distribuicao_normal', 'em_crescimento',
      'tendencia', 'viral', 'distribuicao_reduzida'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS posts_distribution_state_idx ON public.posts(distribution_state);

CREATE OR REPLACE FUNCTION public.recompute_distribution_state(p_post_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post          RECORD;
  v_quality       NUMERIC;
  v_percentile    NUMERIC;
  v_age_hours     NUMERIC;
  v_hidden_count  INTEGER;
  v_new_state     TEXT;
BEGIN
  SELECT id, created_at, views_count, moderation_status INTO v_post FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_age_hours := EXTRACT(EPOCH FROM (now() - v_post.created_at)) / 3600.0;
  SELECT quality_score INTO v_quality FROM public.content_quality WHERE post_id = p_post_id;
  v_quality := COALESCE(v_quality, 60);
  SELECT COUNT(*) INTO v_hidden_count FROM public.post_hidden WHERE post_id = p_post_id;

  IF v_post.moderation_status IN ('spam', 'rejected') OR v_hidden_count >= 5 THEN
    v_new_state := 'distribuicao_reduzida';
  ELSIF v_age_hours < 1 THEN
    v_new_state := 'em_analise';
  ELSIF v_age_hours < 6 THEN
    v_new_state := 'em_teste';
  ELSE
    SELECT COALESCE(AVG(CASE WHEN cq.quality_score <= v_quality THEN 1 ELSE 0 END), 0.5)
      INTO v_percentile
    FROM public.posts p2
    JOIN public.content_quality cq ON cq.post_id = p2.id
    WHERE p2.created_at > now() - INTERVAL '72 hours';

    IF v_percentile >= 0.97 THEN
      v_new_state := 'viral';
    ELSIF v_percentile >= 0.90 THEN
      v_new_state := 'tendencia';
    ELSIF v_percentile >= 0.70 THEN
      v_new_state := 'em_crescimento';
    ELSIF v_percentile >= 0.35 THEN
      v_new_state := 'distribuicao_normal';
    ELSE
      v_new_state := 'distribuicao_reduzida';
    END IF;
  END IF;

  UPDATE public.posts SET distribution_state = v_new_state WHERE id = p_post_id AND distribution_state IS DISTINCT FROM v_new_state;

  RETURN v_new_state;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recompute_distribution_state(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_distribution_state(UUID) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 4. get_personalized_feed_v3 — igual a v2, mas lê a composição do feed
--    (buckets) de algorithm_settings em vez de percentagens fixas, e
--    exclui posts com distribuição reduzida.
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
      AND p.distribution_state != 'distribuicao_reduzida'
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

-- ───────────────────────────────────────────────────────────────────────
-- 5. Dashboard do Centro de IA (só admin).
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ai_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'apenas administradores';
  END IF;

  SELECT json_build_object(
    'usuarios_ativos_7d', (SELECT COUNT(DISTINCT user_id) FROM public.post_impressions WHERE created_at > now() - INTERVAL '7 days'),
    'novos_registos_hoje', (SELECT COUNT(*) FROM public.profiles WHERE created_at > date_trunc('day', now())),
    'publicacoes_hoje', (SELECT COUNT(*) FROM public.posts WHERE created_at > date_trunc('day', now())),
    'visualizacoes_hoje', (SELECT COALESCE(SUM(views_count),0) FROM public.posts WHERE created_at > date_trunc('day', now())),
    'curtidas_hoje', (SELECT COUNT(*) FROM public.post_likes WHERE created_at > date_trunc('day', now())),
    'comentarios_hoje', (SELECT COUNT(*) FROM public.post_comments WHERE created_at > date_trunc('day', now())),
    'partilhas_hoje', (SELECT COUNT(*) FROM public.posts WHERE created_at > date_trunc('day', now()) AND shared_from_post_id IS NOT NULL),
    'distribuicao_estados', (
      SELECT COALESCE(json_object_agg(distribution_state, total), '{}'::json)
      FROM (
        SELECT distribution_state, COUNT(*) AS total
        FROM public.posts
        WHERE created_at > now() - INTERVAL '7 days'
        GROUP BY distribution_state
      ) s
    ),
    'serie_7_dias', (
      SELECT COALESCE(json_agg(row_to_json(d) ORDER BY d.dia), '[]'::json)
      FROM (
        SELECT
          to_char(day_series, 'YYYY-MM-DD') AS dia,
          (SELECT COUNT(*) FROM public.posts p WHERE p.created_at::date = day_series::date) AS publicacoes,
          (SELECT COALESCE(SUM(views_count),0) FROM public.posts p WHERE p.created_at::date = day_series::date) AS visualizacoes,
          (SELECT COUNT(*) FROM public.post_likes pl WHERE pl.created_at::date = day_series::date) AS curtidas
        FROM generate_series(now() - INTERVAL '6 days', now(), INTERVAL '1 day') AS day_series
      ) d
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ai_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_dashboard_stats() TO authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 6. Análise de conteúdo (só admin) — listas por estado de distribuição.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ai_content_analysis(p_state TEXT, p_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  post_id UUID, author_username TEXT, content TEXT, quality_score NUMERIC,
  views_count BIGINT, likes_count INTEGER, comments_count INTEGER,
  distribution_state TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'apenas administradores';
  END IF;

  RETURN QUERY
  SELECT p.id, p.author_username, p.content, COALESCE(cq.quality_score,60),
         p.views_count, p.likes_count, p.comments_count, p.distribution_state, p.created_at
  FROM public.posts p
  LEFT JOIN public.content_quality cq ON cq.post_id = p.id
  WHERE p.distribution_state = p_state
  ORDER BY COALESCE(cq.quality_score, 60) DESC, p.created_at DESC
  LIMIT p_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ai_content_analysis(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_content_analysis(TEXT, INTEGER) TO authenticated;

-- Preenche o estado inicial de publicações já existentes (uma vez, últimos 30 dias).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.posts WHERE created_at > now() - INTERVAL '30 days' LOOP
    PERFORM public.recompute_distribution_state(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Fim.
