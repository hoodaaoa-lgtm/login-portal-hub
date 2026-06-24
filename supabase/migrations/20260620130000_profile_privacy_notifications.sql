-- =====================================================
-- DEFINIÇÕES DE CONTA: privacidade do perfil + preferências
-- de notificações, guardadas como JSON num único campo
-- para não precisar de tabelas extra.
-- =====================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{
    "likes": true,
    "comments": true,
    "follows": true,
    "messages": true,
    "mentions": true
  }'::jsonb;

COMMENT ON COLUMN public.profiles.is_private IS 'Se true, só seguidores aprovados veem posts e perfil completo';
COMMENT ON COLUMN public.profiles.notification_prefs IS 'Preferências de notificação do utilizador (likes, comments, follows, messages, mentions)';
