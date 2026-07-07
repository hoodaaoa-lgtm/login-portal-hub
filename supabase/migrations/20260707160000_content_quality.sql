-- ============================================================================
-- Fase 5 — Qualidade de conteúdo
--
-- Calcula uma pontuação 0-100 por post, combinando 4 dimensões pedidas na
-- especificação:
--   1) qualidade_tecnica  — resolução/nitidez/iluminação/áudio do ficheiro.
--   2) engajamento_real   — retenção (dwell time), reações por alcance.
--   3) originalidade      — se é repost/cópia/duplicado.
--   4) satisfacao         — quantos escondem/denunciam vs quantos veem.
--
-- IMPORTANTE — limitação assumida conscientemente:
-- Ainda NÃO existe nenhum pipeline que abra o ficheiro de vídeo/imagem e meça
-- resolução, nitidez, iluminação, estabilidade ou ruído de áudio (isso exige
-- processamento de media fora da base de dados, ex.: ffprobe/worker externo).
-- Por isso, "quality_technical" arranca com um valor neutro (70) e existe uma
-- função `set_post_technical_quality()` pronta a ser chamada por um futuro
-- worker de análise de media — sem isso, este pilar não penaliza nem beneficia
-- ninguém injustamente enquanto não houver dados reais.
-- As outras 3 dimensões (engajamento, originalidade, satisfação) já usam
-- dados reais que já existem na BD (post_impressions, likes/comments/reposts,
-- post_hidden, moderation_status).
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────
-- 1. Tabela de qualidade — guardada (não é view) para poder ser indexada
--    e usada depois no motor de ranking (Fase 4) sem recalcular tudo a
--    cada pedido de feed.
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_quality (
  post_id              UUID PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  quality_technical     NUMERIC NOT NULL DEFAULT 70,   -- placeholder até existir pipeline real (ver nota acima)
  quality_engagement    NUMERIC NOT NULL DEFAULT 50,
  quality_originality   NUMERIC NOT NULL DEFAULT 100,
  quality_satisfaction  NUMERIC NOT NULL DEFAULT 100,
  quality_score         NUMERIC NOT NULL DEFAULT 60,   -- combinado final 0-100
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_quality_score_idx ON public.content_quality(quality_score DESC);

ALTER TABLE public.content_quality ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.content_quality TO authenticated, anon;
GRANT ALL ON public.content_quality TO service_role;

DROP POLICY IF EXISTS "content_quality public read" ON public.content_quality;
CREATE POLICY "content_quality public read" ON public.content_quality
  FOR SELECT TO authenticated, anon USING (true);

-- ───────────────────────────────────────────────────────────────────────
-- 2. Função que (re)calcula a qualidade de UM post a partir de dados reais.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_content_quality(p_post_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_post              RECORD;
  v_avg_dwell_ms       NUMERIC;
  v_impressions        INTEGER;
  v_hidden_count        INTEGER;
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

  -- ── Engajamento real: reações por alcance + retenção média ──
  -- Taxa de reação relativa a quem viu (evita favorecer só contas grandes).
  v_engagement_rate := (
    COALESCE(v_post.likes_count, 0) * 3
    + COALESCE(v_post.comments_count, 0) * 4
    + COALESCE(v_post.reposts_count, 0) * 5
    + COALESCE(v_post.quotes_count, 0) * 4
    + COALESCE(v_post.replies_count, 0) * 2
  )::NUMERIC / GREATEST(COALESCE(v_post.views_count, 0), 1);
  -- 0.5 reações ponderadas por visualização já é excelente (rate alta) -> normaliza para 0-100.
  v_engagement_rate := LEAST(100, v_engagement_rate * 200);

  SELECT AVG(dwell_ms), COUNT(*) INTO v_avg_dwell_ms, v_impressions
  FROM public.post_impressions WHERE post_id = p_post_id;
  -- 12s (12000ms) de permanência média já é um sinal forte de retenção -> teto 100.
  v_retention_score := LEAST(100, COALESCE(v_avg_dwell_ms, 0) / 12000.0 * 100);

  -- Sem impressões registadas ainda: não penaliza (fica neutro), só combina
  -- retenção quando já existem dados suficientes para ser fiável.
  IF COALESCE(v_impressions, 0) >= 3 THEN
    v_engagement := (v_engagement_rate * 0.6) + (v_retention_score * 0.4);
  ELSE
    v_engagement := v_engagement_rate;
  END IF;

  -- ── Originalidade ──
  v_originality := 100;
  IF v_post.shared_from_post_id IS NOT NULL THEN
    v_originality := 45;  -- é um repost/citação, não conteúdo original
  END IF;
  IF v_post.moderation_status = 'spam' THEN
    v_originality := 0;   -- já sinalizado como spam/duplicado pelo heurístico
  END IF;

  -- ── Satisfação: quantos escondem esta publicação vs quantos a veem ──
  SELECT COUNT(*) INTO v_hidden_count FROM public.post_hidden WHERE post_id = p_post_id;
  v_satisfaction := 100 - LEAST(100, (v_hidden_count::NUMERIC / GREATEST(COALESCE(v_post.views_count, 0), 1)) * 500);
  IF v_post.is_sensitive THEN
    v_satisfaction := v_satisfaction - 15;  -- conteúdo sinalizado sensível reduz um pouco a satisfação
  END IF;
  v_satisfaction := GREATEST(0, v_satisfaction);

  -- ── Técnica: placeholder neutro até existir pipeline real de media ──
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

  RETURN v_final;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recompute_content_quality(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_content_quality(UUID) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Hook para um futuro worker de análise técnica real (resolução,
--    nitidez, iluminação, estabilidade, áudio). Chamar isto assim que
--    esse pipeline existir; entretanto fica só disponível, sem uso.
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_post_technical_quality(p_post_id UUID, p_score NUMERIC)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.content_quality (post_id, quality_technical)
  VALUES (p_post_id, LEAST(100, GREATEST(0, p_score)))
  ON CONFLICT (post_id) DO UPDATE SET quality_technical = LEAST(100, GREATEST(0, p_score));
  PERFORM public.recompute_content_quality(p_post_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_post_technical_quality(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_post_technical_quality(UUID, NUMERIC) TO service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 4. Recalcular automaticamente quando os contadores de engagement do
--    post mudam (likes/comments/reposts/quotes/replies/views), com
--    proteção para não disparar em cascata (só corre se algum contador
--    realmente mudou).
-- ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_recompute_quality_on_counts_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.likes_count, NEW.comments_count, NEW.reposts_count, NEW.quotes_count, NEW.replies_count, NEW.views_count)
     IS DISTINCT FROM
     (OLD.likes_count, OLD.comments_count, OLD.reposts_count, OLD.quotes_count, OLD.replies_count, OLD.views_count)
  THEN
    PERFORM public.recompute_content_quality(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quality_on_counts_change ON public.posts;
CREATE TRIGGER trg_quality_on_counts_change
  AFTER UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_quality_on_counts_change();

-- Também calcular uma primeira vez quando o post é criado (fica neutro
-- até ter dados, mas já existe a linha para o ranking poder fazer JOIN).
CREATE OR REPLACE FUNCTION public.trg_init_quality_on_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.content_quality (post_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quality_on_insert ON public.posts;
CREATE TRIGGER trg_quality_on_insert
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_init_quality_on_insert();

-- Fim.
