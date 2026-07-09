-- ============================================================================
-- Fase 6b — Telemetria implícita (completa) + ledger explícito unificado
--
-- post_impressions já existe e já grava dwell_ms. Aqui só se completa com
-- os dois sinais que faltavam na especificação:
--   - visualizado_completo: chegou ao fim do vídeo/carrossel (sinal forte
--     de que o conteúdo prendeu, independente da duração).
--   - passou_direto (skip): dwell_ms muito baixo (< 800ms tipicamente) —
--     sinal negativo explícito, hoje só é "inferido" pela ausência de dados.
--
-- interacoes_usuario: o projeto já tem sinais explícitos espalhados em
-- tabelas próprias (post_likes, reposts, post_saves, comments — cada uma
-- otimizada para a sua UI). Em vez de as substituir (risco alto, muita UI
-- depende delas), esta tabela é um LEDGER somado a partir de agora: todo
-- like/share/save/comentário novo grava aqui também (via RPC única,
-- chamada pelo mesmo botão que already grava na tabela específica), e serve
-- só para uma coisa — alimentar o vetor de interesse com peso maior que um
-- simples dwell time. Não substitui as tabelas de UI, é a "trilha" para o
-- motor de recomendação.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

ALTER TABLE public.post_impressions
  ADD COLUMN IF NOT EXISTS visualizado_completo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS passou_direto BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.post_impressions.visualizado_completo IS 'true quando o utilizador viu o post/vídeo até ao fim.';
COMMENT ON COLUMN public.post_impressions.passou_direto IS 'true quando dwell_ms ficou abaixo do limiar de skip (ver SKIP_THRESHOLD_MS no cliente, hoje 800ms) — sinal negativo explícito.';

-- Ledger de sinais explícitos (peso alto no vetor de interesse).
CREATE TABLE IF NOT EXISTS public.interacoes_usuario (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id      UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id    UUID,
  tipo         TEXT NOT NULL CHECK (tipo IN ('like', 'share', 'save', 'comment', 'hide', 'report')),
  -- peso relativo de cada sinal no cálculo do vetor de interesse — 'hide' e
  -- 'report' entram negativos, o resto positivo. Ajustável sem migração
  -- nova (é dado, não código).
  peso         NUMERIC NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interacoes_usuario_user_idx ON public.interacoes_usuario(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS interacoes_usuario_post_idx ON public.interacoes_usuario(post_id);

ALTER TABLE public.interacoes_usuario ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.interacoes_usuario TO authenticated;
GRANT ALL ON public.interacoes_usuario TO service_role;

DROP POLICY IF EXISTS "interacoes self read" ON public.interacoes_usuario;
CREATE POLICY "interacoes self read" ON public.interacoes_usuario FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "interacoes self insert" ON public.interacoes_usuario;
CREATE POLICY "interacoes self insert" ON public.interacoes_usuario FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Pesos default por tipo — usados pela função registar_interacao() abaixo
-- para não espalhar números mágicos pelo código cliente.
CREATE OR REPLACE FUNCTION public._peso_padrao_interacao(p_tipo TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tipo
    WHEN 'like'    THEN 3
    WHEN 'save'    THEN 5   -- guardar é o sinal positivo mais forte que existe
    WHEN 'share'   THEN 4
    WHEN 'comment' THEN 4
    WHEN 'hide'    THEN -6
    WHEN 'report'  THEN -10
    ELSE 1
  END;
$$;

-- Chamar isto a partir do mesmo botão que já grava like/share/save/comment —
-- é só mais um INSERT, não faz nada de custoso.
CREATE OR REPLACE FUNCTION public.registar_interacao(
  p_post_id UUID,
  p_tipo    TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author_id UUID;
BEGIN
  SELECT author_id INTO v_author_id FROM public.posts WHERE id = p_post_id;

  INSERT INTO public.interacoes_usuario (user_id, post_id, author_id, tipo, peso)
  VALUES (auth.uid(), p_post_id, v_author_id, p_tipo, public._peso_padrao_interacao(p_tipo));

  -- dispara a atualização incremental do vetor de interesse (peso maior
  -- que um simples dwell time — ver migração 20260709160000).
  PERFORM public.atualizar_vetor_interesse(auth.uid(), p_post_id, public._peso_padrao_interacao(p_tipo));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registar_interacao(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registar_interacao(UUID, TEXT) TO authenticated;

-- Fim.
