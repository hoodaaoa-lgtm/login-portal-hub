-- ============================================================================
-- Centro de IA → "Conteúdo sensível" no admin
--
-- A moderação automática (texto + imagem, edge function moderate-content)
-- já existe e já grava moderation_status/is_sensitive/moderation_categories
-- em posts + o histórico em content_moderation_log. O que faltava era uma
-- forma do admin VER esse resultado: publicações que a IA marcou como
-- sensíveis/nudez/violência/assédio/spam/golpe, com a imagem, a categoria,
-- a confiança e as palavras-chave — para revisão humana rápida.
--
-- Duas RPCs novas, só para admin (is_hooda_admin()):
--   1) get_ai_sensitive_content(p_limit) — lista publicações sinalizadas.
--   2) admin_override_moderation(p_post_id, p_category) — o admin corrige
--      manualmente a classificação (ex.: "safe" depois de rever à mão).
-- Seguro correr mais que uma vez (idempotente).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_ai_sensitive_content(p_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  post_id             UUID,
  author_id           UUID,
  author_username     TEXT,
  author_name         TEXT,
  content             TEXT,
  photo_url           TEXT,
  photos              JSONB,
  video_url           TEXT,
  thumbnail_url       TEXT,
  moderation_status   TEXT,
  is_sensitive        BOOLEAN,
  confidence          NUMERIC,
  keywords            JSONB,
  sentiment           TEXT,
  moderation_checked_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'Apenas administradores.';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.author_id, p.author_username, p.author_name,
    p.content, p.photo_url, p.photos, p.video_url, p.thumbnail_url,
    p.moderation_status, p.is_sensitive,
    (p.moderation_categories->>'confidence')::NUMERIC,
    COALESCE(p.moderation_categories->'keywords', '[]'::jsonb),
    p.moderation_categories->>'sentiment',
    p.moderation_checked_at, p.created_at
  FROM public.posts p
  WHERE p.moderation_status NOT IN ('safe', 'pending')
  ORDER BY p.moderation_checked_at DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ai_sensitive_content(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_sensitive_content(INTEGER) TO authenticated;

-- Correção manual do admin depois de rever (ex.: falso positivo → "safe",
-- ou confirma/agrava a categoria). Fica registado em content_moderation_log
-- com o modelo "admin_override" para distinguir de uma reclassificação da IA.
CREATE OR REPLACE FUNCTION public.admin_override_moderation(
  p_post_id  UUID,
  p_category TEXT
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_hooda_admin() THEN
    RAISE EXCEPTION 'Apenas administradores.';
  END IF;

  IF p_category NOT IN (
    'pending','safe','sensitive','nudity','violence','harassment','spam','scam','illegal'
  ) THEN
    RAISE EXCEPTION 'Categoria inválida: %', p_category;
  END IF;

  UPDATE public.posts SET
    moderation_status     = p_category,
    is_sensitive           = p_category IN ('sensitive','nudity','violence','harassment'),
    moderation_checked_at  = now()
  WHERE id = p_post_id;

  INSERT INTO public.content_moderation_log (post_id, model, category, confidence, raw_result)
  VALUES (p_post_id, 'admin_override', p_category, 100, jsonb_build_object('admin_id', auth.uid()));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_override_moderation(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_override_moderation(UUID, TEXT) TO authenticated;

-- Fim.
