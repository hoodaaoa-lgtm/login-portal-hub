-- ───────────────────────────────────────────────────────────────────────
-- Busca de Salas ignorando acentos (ex: "angola" encontra "Ângola",
-- "sao paulo" encontra "São Paulo"). Usa a extensão unaccent do Postgres.
-- ───────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Buscar salas públicas ignorando acentos, por palavras, em
--    nome + descricao + slug ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sala_buscar_publicas(p_query text)
RETURNS SETOF public.salas
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_palavras text[];
  v_palavra text;
  v_where text := '';
BEGIN
  IF p_query IS NULL OR btrim(p_query) = '' THEN
    RETURN;
  END IF;

  v_palavras := regexp_split_to_array(btrim(p_query), '\s+');

  RETURN QUERY
  SELECT s.*
  FROM public.salas s
  WHERE s.tipo = 'publica'
    AND EXISTS (
      SELECT 1 FROM unnest(v_palavras) AS palavra
      WHERE public.unaccent(s.nome) ILIKE '%' || public.unaccent(palavra) || '%'
         OR public.unaccent(coalesce(s.descricao, '')) ILIKE '%' || public.unaccent(palavra) || '%'
         OR public.unaccent(s.slug) ILIKE '%' || public.unaccent(palavra) || '%'
    )
  ORDER BY s.membros_count DESC
  LIMIT 30;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sala_buscar_publicas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sala_buscar_publicas(text) TO authenticated;
