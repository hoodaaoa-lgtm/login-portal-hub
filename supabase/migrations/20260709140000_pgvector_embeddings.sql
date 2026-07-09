-- ============================================================================
-- Fase 6 — Feed Inteligente: embeddings semânticos (pgvector)
--
-- O motor de ranking atual (get_personalized_feed) já mede afinidade por
-- AUTOR (user_interests) + qualidade + frescor + follows. O que falta é
-- afinidade por CONTEÚDO em si: dois posts de autores diferentes, mas sobre
-- o mesmo assunto, deviam "contar" para o mesmo interesse. É para isso que
-- serve o embedding vetorial — texto/legenda/transcrição do post convertidos
-- num vetor de N dimensões pela IA (Lovable AI Gateway / Gemini), onde
-- distância pequena = assunto parecido.
--
-- Dimensão escolhida: 768 (compatível com google/text-embedding-004, já no
-- mesmo espírito do que é usado no projeto para classificação — ver
-- post_classifications). Se trocarem de modelo de embedding para um com
-- outra dimensão (ex.: OpenAI text-embedding-3-small = 1536), este número
-- tem de mudar aqui e em qualquer sítio que gere o vetor.
--
-- Índice: HNSW em vez de IVFFlat — não precisa de passo de "treino"
-- (IVFFlat exige popular a tabela antes de criar o índice para os clusters
-- ficarem bons), é mais previsível com escrita contínua (posts novos a toda
-- hora) e o pgvector do Supabase já suporta hnsw nativamente.
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS embedding vector(768);

COMMENT ON COLUMN public.posts.embedding IS
  'Embedding semântico (768d) gerado a partir de legenda + hashtags + transcrição do media. NULL até a edge function de embedding processar o post (mesmo pipeline de post_classifications).';

-- Índice HNSW para busca por similaridade de cosseno (operador <=>).
-- m/ef_construction default do pgvector (16/64) são um bom ponto de partida
-- para até alguns milhões de linhas; se o feed começar a ficar lento,
-- primeiro tentar subir ef_search na sessão antes de mexer aqui.
CREATE INDEX IF NOT EXISTS posts_embedding_hnsw_idx
  ON public.posts
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Fim.
