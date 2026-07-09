-- ============================================================================
-- Fase 6c-bis — Anti-fadiga de conteúdo (re-ranking)
--
-- Regra pedida: nunca mais de 2 posts seguidos do MESMO CRIADOR nem do
-- MESMO TÓPICO no feed final devolvido. O diversifyByAuthor que já existia
-- em src/lib/feedSeen.ts só olhava para author_id, no CLIENTE, e só depois
-- da paginação já estar decidida — não resolve o caso de a página 1 acabar
-- e a página 2 começar com o mesmo autor da última posição da página 1.
--
-- Aqui isto passa a correr DENTRO da função de feed, sobre um pool maior do
-- que p_limit (overfetch, ver get_personalized_feed_v2), de forma que haja
-- sempre candidatos de sobra para trocar quando a regra seria quebrada.
--
-- Algoritmo: guloso, de esquerda para a direita. Para cada posição, se o
-- próximo item do pool (por rank_score) repetiria autor OU tópico da
-- posição anterior 2x seguidas, salta à frente à procura do candidato
-- melhor posicionado que não quebre a regra; se não encontrar nenhum
-- (pool pequeno de mais / um autor domina tudo), deixa-o entrar mesmo assim
-- — a regra de negócio não pode fazer o feed devolver menos itens do que
-- o pedido.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.feed_item AS (
    post_id      UUID,
    rank_score   NUMERIC,
    bucket       TEXT,
    author_id    UUID,
    top_category TEXT
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.diversificar_feed(
  p_pool public.feed_item[]
) RETURNS SETOF public.feed_item
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_items       public.feed_item[] := p_pool;
  v_result      public.feed_item[] := '{}';
  v_used        BOOLEAN[] := array_fill(false, ARRAY[COALESCE(array_length(p_pool, 1), 0)]);
  v_n           INTEGER := COALESCE(array_length(p_pool, 1), 0);
  v_last_author UUID;
  v_last_author_count INTEGER := 0;
  v_last_topic  TEXT;
  v_last_topic_count  INTEGER := 0;
  i             INTEGER;
  j             INTEGER;
  v_pick        INTEGER;
  v_candidate   public.feed_item;
BEGIN
  IF v_n = 0 THEN
    RETURN;
  END IF;

  FOR i IN 1..v_n LOOP
    v_pick := NULL;

    -- 1ª tentativa: o melhor candidato ainda não usado que respeite a regra.
    FOR j IN 1..v_n LOOP
      IF v_used[j] THEN CONTINUE; END IF;
      v_candidate := v_items[j];

      IF (v_candidate.author_id = v_last_author AND v_last_author_count >= 2)
         OR (v_candidate.top_category = v_last_topic AND v_last_topic_count >= 2) THEN
        CONTINUE; -- quebraria a regra, tenta o próximo candidato
      END IF;

      v_pick := j;
      EXIT;
    END LOOP;

    -- Sem candidato "seguro" (ex.: um autor/tópico domina o pool inteiro) —
    -- usa o melhor ainda disponível mesmo assim, para nunca devolver menos
    -- itens do que o pedido.
    IF v_pick IS NULL THEN
      FOR j IN 1..v_n LOOP
        IF NOT v_used[j] THEN
          v_pick := j;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    EXIT WHEN v_pick IS NULL; -- pool esgotado

    v_used[v_pick] := true;
    v_candidate := v_items[v_pick];
    v_result := array_append(v_result, v_candidate);

    IF v_candidate.author_id = v_last_author THEN
      v_last_author_count := v_last_author_count + 1;
    ELSE
      v_last_author := v_candidate.author_id;
      v_last_author_count := 1;
    END IF;

    IF v_candidate.top_category = v_last_topic THEN
      v_last_topic_count := v_last_topic_count + 1;
    ELSE
      v_last_topic := v_candidate.top_category;
      v_last_topic_count := 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT * FROM unnest(v_result);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.diversificar_feed(public.feed_item[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diversificar_feed(public.feed_item[]) TO authenticated, service_role;

-- Fim.
