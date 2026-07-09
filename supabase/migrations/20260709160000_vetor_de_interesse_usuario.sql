-- ============================================================================
-- Fase 6c — Vetor de Interesse do Utilizador (em tempo real, sem varrer
-- histórico a cada pedido de feed)
--
-- A definição pedida é "média dos embeddings dos posts onde o utilizador
-- passou mais tempo de ecrã (dwell > 5s)". Fazer essa média recalculando
-- sobre TODO o histórico a cada vez que o utilizador abre o feed seria caro
-- (SELECT + AVG sobre milhares de linhas, por utilizador, em cada pedido).
--
-- Em vez disso: guarda-se um vetor já calculado (user_taste_vectors) e
-- atualiza-se de forma incremental com EMA (exponential moving average)
-- sempre que surge um sinal novo — O(1) por atualização, não O(histórico).
-- alpha = quanto o sinal mais recente pesa vs. o vetor acumulado; um
-- alpha maior para sinais explícitos (like/save pesam mais que só dwell).
--
-- alpha_efetivo = peso_do_sinal / (peso_do_sinal + sample_size_atual),
-- limitado a um mínimo de 0.02 para o vetor nunca ficar "congelado" depois
-- de muitas interações, e um máximo de 0.35 para um único sinal não virar
-- o gosto do utilizador do avesso de uma vez.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_taste_vectors (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  embedding    vector(768),
  sample_size  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_taste_vectors ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_taste_vectors TO authenticated;
GRANT ALL ON public.user_taste_vectors TO service_role;

DROP POLICY IF EXISTS "taste vector self read" ON public.user_taste_vectors;
CREATE POLICY "taste vector self read" ON public.user_taste_vectors FOR SELECT USING (auth.uid() = user_id);

-- NOTA DE COMPATIBILIDADE: a multiplicação vetor * escalar (usada abaixo em
-- v_current * (1 - v_alpha)) só existe no pgvector >= 0.7.0. O Supabase
-- hospedado já vem com uma versão recente o suficiente; se estiverem numa
-- instância própria mais antiga, substituir essa linha por uma reconstrução
-- via unnest/array_agg elemento a elemento.

-- Limiar de dwell time pedido na spec: só dwell > 5s entra no vetor via
-- sinal implícito (interações explícitas entram sempre, mesmo com dwell
-- curto — um "like" rápido ainda é um sinal válido).
CREATE OR REPLACE FUNCTION public.atualizar_vetor_interesse(
  p_user_id  UUID,
  p_post_id  UUID,
  p_peso     NUMERIC DEFAULT 1
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post_embedding vector(768);
  v_current        vector(768);
  v_sample_size    INTEGER;
  v_alpha          NUMERIC;
BEGIN
  SELECT embedding INTO v_post_embedding FROM public.posts WHERE id = p_post_id;
  IF v_post_embedding IS NULL THEN
    RETURN; -- post ainda sem embedding (pipeline de classificação não passou) — nada a fazer
  END IF;

  SELECT embedding, sample_size INTO v_current, v_sample_size
  FROM public.user_taste_vectors WHERE user_id = p_user_id;

  IF v_current IS NULL THEN
    -- primeiro sinal deste utilizador: o vetor de interesse começa a ser o
    -- próprio embedding do post.
    INSERT INTO public.user_taste_vectors (user_id, embedding, sample_size, updated_at)
    VALUES (p_user_id, v_post_embedding, 1, now())
    ON CONFLICT (user_id) DO UPDATE
      SET embedding = EXCLUDED.embedding, sample_size = 1, updated_at = now();
    RETURN;
  END IF;

  v_alpha := LEAST(0.35, GREATEST(0.02, p_peso / (p_peso + COALESCE(v_sample_size, 0))));

  UPDATE public.user_taste_vectors
  SET embedding   = (v_current * (1 - v_alpha)::double precision) + (v_post_embedding * v_alpha::double precision),
      sample_size = sample_size + 1,
      updated_at  = now()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.atualizar_vetor_interesse(UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_vetor_interesse(UUID, UUID, NUMERIC) TO authenticated, service_role;

-- Trigger no post_impressions: dispara o mesmo mecanismo automaticamente
-- quando o dwell time cruza o limiar de 5s (implícito, peso baixo) ou
-- quando visualizado_completo passa a true (mais forte que só 5s).
-- Usa uma UNIQUE(user_id, post_id) existente + UPSERT, então isto corre uma
-- vez por post por utilizador (na 1ª vez que o dwell ultrapassa o limiar).
CREATE OR REPLACE FUNCTION public._trg_dwell_atualiza_vetor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_peso NUMERIC;
  v_ja_contava BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_ja_contava := (OLD.dwell_ms > 5000) OR OLD.visualizado_completo;
  END IF;

  IF (NEW.dwell_ms > 5000 OR NEW.visualizado_completo) AND NOT v_ja_contava THEN
    v_peso := 1 + (CASE WHEN NEW.visualizado_completo THEN 1 ELSE 0 END);
    PERFORM public.atualizar_vetor_interesse(NEW.user_id, NEW.post_id, v_peso);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dwell_atualiza_vetor ON public.post_impressions;
CREATE TRIGGER trg_dwell_atualiza_vetor
  AFTER INSERT OR UPDATE ON public.post_impressions
  FOR EACH ROW EXECUTE FUNCTION public._trg_dwell_atualiza_vetor();

-- Fim.
