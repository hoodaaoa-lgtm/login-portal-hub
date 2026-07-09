-- ============================================================================
-- Explorar Inteligente (Descoberta de Conteúdo)
--
-- NÃO cria tabela de categorias nem de "posts vistos" — já existem e já
-- fazem esse papel:
--   - Categorias/tags M:N com posts  → content_categories (taxonomia) +
--     post_classifications.categories (JSONB [{slug,name,score}] por post,
--     gerado pela Fase 2 de classificação). GIN já existe nessa coluna.
--   - Histórico de vistos             → post_impressions (dwell_ms,
--     visualizado_completo, passou_direto) + interacoes_usuario (ledger de
--     like/save/share/comment/hide/report). Mesmo padrão usado por
--     get_personalized_feed_v2 no feed principal.
--   - Anti-fadiga autor/tópico        → diversificar_feed() (Fase 6c-bis),
--     reaproveitada tal e qual aqui, sem duplicar a lógica.
--
-- O que este ficheiro acrescenta (só o que faltava mesmo):
--   1) top_category persistida em post_classifications — coluna gerada +
--      índice, para o WHERE de afinidade por categoria não precisar de
--      abrir o JSONB a cada linha candidata (performance).
--   2) get_user_top_categories(user, limit) — as N categorias que o
--      utilizador mais consome (sinais explícitos com peso alto +
--      dwell>5s com peso baixo), para a regra dos 80%.
--   3) get_trending_gravity(user, limit, horas) — tendências das últimas
--      48h com fórmula de gravidade, já excluindo autores seguidos.
--   4) get_explore_feed(...) — RPC principal: mistura 80% afinidade por
--      categoria + 20% serendipidade (aleatório dentro do que está em
--      alta), nunca de quem já segue, nunca repete quem já viu nas
--      últimas 72h, com paginação por cursor (mesmo padrão de
--      get_personalized_feed_v2) e anti-fadiga final via diversificar_feed.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────
-- 1. Performance: categoria principal do post como coluna indexável.
--    (categories é ordenado por score na classificação — categories->0 já
--    é a categoria dominante; só está "escondida" dentro do JSONB.)
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.post_classifications
  ADD COLUMN IF NOT EXISTS top_category TEXT
  GENERATED ALWAYS AS (categories -> 0 ->> 'slug') STORED;

CREATE INDEX IF NOT EXISTS post_classifications_top_category_idx
  ON public.post_classifications(top_category);

-- ───────────────────────────────────────────────────────────────────────
-- 2. Top categorias consumidas pelo utilizador (base da regra dos 80%).
--    Combina o ledger explícito (peso alto, já pesado por tipo em
--    interacoes_usuario) com o sinal implícito de dwell>5s (peso 1, cobre
--    quem ainda não deu like/save em nada mas já passa tempo a ler).
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_top_categories(
  p_user_id UUID,
  p_limit   INTEGER DEFAULT 3
) RETURNS TABLE (slug TEXT, weight NUMERIC)
LANGUAGE sql STABLE
AS $$
  WITH sinais AS (
    SELECT pc.top_category AS slug, iu.peso AS peso
    FROM public.interacoes_usuario iu
    JOIN public.post_classifications pc ON pc.post_id = iu.post_id
    WHERE iu.user_id = p_user_id
      AND iu.tipo NOT IN ('hide', 'report')
      AND iu.created_at > now() - INTERVAL '90 days'
      AND pc.top_category IS NOT NULL
    UNION ALL
    SELECT pc.top_category AS slug, 1 AS peso
    FROM public.post_impressions pi
    JOIN public.post_classifications pc ON pc.post_id = pi.post_id
    WHERE pi.user_id = p_user_id
      AND (pi.dwell_ms > 5000 OR pi.visualizado_completo)
      AND pi.created_at > now() - INTERVAL '90 days'
      AND pc.top_category IS NOT NULL
  )
  SELECT slug, SUM(peso) AS weight
  FROM sinais
  GROUP BY slug
  ORDER BY weight DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_top_categories(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_top_categories(UUID, INTEGER) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Tendências com decaimento temporal (gravidade), últimas 48h.
--    score = interações_ponderadas / (idade_em_horas + 2)^1.5
--    Já exclui quem o utilizador segue e o próprio utilizador — a query
--    de tendências do Explorar NUNCA deve sugerir quem já é seguido.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_trending_gravity(
  p_user_id UUID,
  p_limit   INTEGER DEFAULT 50,
  p_hours   INTEGER DEFAULT 48
) RETURNS TABLE (
  post_id        UUID,
  author_id      UUID,
  created_at     TIMESTAMPTZ,
  top_category   TEXT,
  trending_score NUMERIC
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.author_id,
    p.created_at,
    COALESCE(pc.top_category, 'geral'),
    (
      (
        COALESCE(p.likes_count, 0)   * 1
        + COALESCE(p.comments_count, 0) * 3
        + COALESCE(p.reposts_count, 0)  * 4
        + COALESCE(p.quotes_count, 0)   * 3
        + COALESCE(p.replies_count, 0)  * 2
      )::NUMERIC
      / POWER(GREATEST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600.0, 0) + 2, 1.5)
    ) AS trending_score
  FROM public.posts p
  LEFT JOIN public.post_classifications pc ON pc.post_id = p.id
  WHERE p.created_at > now() - (p_hours || ' hours')::INTERVAL
    AND p.author_id IS DISTINCT FROM p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = p_user_id AND f.following_id = p.author_id
    )
  ORDER BY trending_score DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.get_trending_gravity(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trending_gravity(UUID, INTEGER, INTEGER) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 4. RPC principal do Explorar — 80% afinidade por categoria / 20%
--    serendipidade (aleatório dentro do que está em alta).
--
--    Paginação: mesmo padrão de get_personalized_feed_v2 — p_cursor
--    (created_at do último post da página anterior) + p_exclude_ids
--    (ids já mostrados nesta sessão, vindo de feedSeen.ts no cliente,
--    reaproveitado tal e qual). p_hard_exclude_hours=72 filtra
--    post_impressions das últimas 72h, conforme pedido.
--
--    Overfetch (3x p_limit) + diversificar_feed no fim: mesma técnica já
--    usada no feed principal, sem reinventar nada.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_explore_feed(
  p_user_id            UUID,
  p_cursor             TIMESTAMPTZ DEFAULT now(),
  p_limit              INTEGER DEFAULT 20,
  p_exclude_ids        UUID[]  DEFAULT '{}'::UUID[],
  p_hard_exclude_hours INTEGER DEFAULT 72
) RETURNS TABLE (
  post_id      UUID,
  rank_score   NUMERIC,
  bucket       TEXT,
  author_id    UUID,
  top_category TEXT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_overfetch     INTEGER := GREATEST(p_limit * 3, 30);
  v_n_afinidade   INTEGER := GREATEST(1, ROUND(v_overfetch * 0.8));
  v_n_serendipity INTEGER := GREATEST(1, v_overfetch - ROUND(v_overfetch * 0.8));
BEGIN
  RETURN QUERY
  WITH top_cats AS (
    SELECT slug FROM public.get_user_top_categories(p_user_id, 3)
  ),
  seen AS (
    SELECT pi.post_id
    FROM public.post_impressions pi
    WHERE pi.user_id = p_user_id
      AND pi.created_at > now() - (p_hard_exclude_hours || ' hours')::INTERVAL
    UNION
    SELECT x.id FROM unnest(p_exclude_ids) AS x(id)
  ),
  -- 80% — afinidade pelas top-3 categorias que o utilizador mais consome,
  -- só de gente que ele AINDA NÃO segue.
  afinidade_pool AS (
    SELECT
      p.id, p.author_id, pc.top_category,
      (
        COALESCE(cq.quality_score, 60) * 0.45
        + GREATEST(0, 100 - EXTRACT(EPOCH FROM (now() - p.created_at)) / 259200.0 * 100) * 0.30
        + 25 -- bónus fixo por bater com categoria preferida do utilizador
      ) AS rank_score
    FROM public.posts p
    JOIN public.post_classifications pc ON pc.post_id = p.id
    LEFT JOIN public.content_quality cq ON cq.post_id = p.id
    WHERE p.created_at < p_cursor
      AND p.author_id IS DISTINCT FROM p_user_id
      AND pc.top_category IN (SELECT slug FROM top_cats)
      AND NOT EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = p_user_id AND f.following_id = p.author_id
      )
      AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.post_id = p.id)
    ORDER BY p.created_at DESC
    LIMIT 300
  ),
  b_afinidade AS (
    SELECT id AS post_id, author_id, top_category, rank_score,
           'afinidade_categoria'::TEXT AS bucket
    FROM afinidade_pool
    ORDER BY rank_score DESC
    LIMIT v_n_afinidade
  ),
  -- 20% — serendipidade: amostra ALEATÓRIA dentro do que está em alta
  -- (não é "os melhores", é descoberta de verdade — por isso random(),
  -- não ORDER BY trending_score).
  serendipity_pool AS (
    SELECT g.post_id, g.author_id, g.top_category, g.trending_score
    FROM public.get_trending_gravity(p_user_id, 200, 48) g
    WHERE g.created_at < p_cursor
      AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.post_id = g.post_id)
  ),
  b_serendipity AS (
    SELECT post_id, author_id, top_category, trending_score AS rank_score,
           'serendipidade_tendencia'::TEXT AS bucket
    FROM serendipity_pool
    ORDER BY random()
    LIMIT v_n_serendipity
  ),
  combined AS (
    SELECT * FROM b_afinidade
    UNION ALL
    SELECT * FROM b_serendipity
  ),
  -- Se um dos dois baldes ficar curto (ex.: utilizador novo, sem
  -- categorias de afinidade ainda), preenche com descoberta geral por
  -- qualidade+frescor — nunca devolve menos do que p_limit por causa
  -- disso, igual ao "filler" do feed principal.
  filler AS (
    SELECT
      p.id AS post_id, p.author_id, COALESCE(pc.top_category, 'geral') AS top_category,
      (COALESCE(cq.quality_score, 60) * 0.5
        + GREATEST(0, 100 - EXTRACT(EPOCH FROM (now() - p.created_at)) / 259200.0 * 100) * 0.5
      ) AS rank_score,
      'descoberta_geral'::TEXT AS bucket
    FROM public.posts p
    LEFT JOIN public.post_classifications pc ON pc.post_id = p.id
    LEFT JOIN public.content_quality cq ON cq.post_id = p.id
    WHERE p.created_at < p_cursor
      AND p.author_id IS DISTINCT FROM p_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.follows f
        WHERE f.follower_id = p_user_id AND f.following_id = p.author_id
      )
      AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.post_id = p.id)
      AND p.id NOT IN (SELECT post_id FROM combined)
    ORDER BY p.created_at DESC
    LIMIT GREATEST(0, v_overfetch - (SELECT COUNT(*) FROM combined))
  ),
  pool AS (
    SELECT * FROM combined
    UNION ALL
    SELECT * FROM filler
  )
  -- Anti-fadiga final: reordena o pool (já maior que p_limit) para nunca
  -- deixar 3 seguidos do mesmo autor/tópico, só depois corta em p_limit.
  SELECT d.post_id, d.rank_score, d.bucket, d.author_id, d.top_category
  FROM public.diversificar_feed(
    (SELECT array_agg(
       ROW(pool.post_id, pool.rank_score, pool.bucket, pool.author_id, pool.top_category)::public.feed_item
       ORDER BY pool.rank_score DESC
     ) FROM pool)
  ) AS d
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_explore_feed(UUID, TIMESTAMPTZ, INTEGER, UUID[], INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_explore_feed(UUID, TIMESTAMPTZ, INTEGER, UUID[], INTEGER) TO authenticated;

-- Fim.
