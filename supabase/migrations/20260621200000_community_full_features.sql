-- ============================================================
-- COMMUNITY FULL FEATURES
-- Cria as tabelas em falta para que todas as funcionalidades
-- de definições das comunidades funcionem de verdade:
--   - community_settings  (permissões de conteúdo)
--   - community_rules     (regras visíveis a todos os membros)
--   - community_bans      (banimentos permanentes)
--   - community_mutes     (silenciamentos temporários)
-- ============================================================

-- ── community_settings ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_settings (
  community_id          uuid PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
  who_can_post          text    NOT NULL DEFAULT 'all',        -- 'all' | 'moderators' | 'admins'
  who_can_comment       text    NOT NULL DEFAULT 'all',        -- 'all' | 'members' | 'moderators'
  can_send_images       boolean NOT NULL DEFAULT true,
  can_send_videos       boolean NOT NULL DEFAULT true,
  can_share_links       boolean NOT NULL DEFAULT true,
  posts_need_approval   boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer membro pode ler as permissões da sua comunidade
CREATE POLICY "cs select member" ON public.community_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
       WHERE cm.community_id = community_settings.community_id
         AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_settings.community_id
         AND (c.privacy = 'public' OR c.owner_id = auth.uid())
    )
  );

-- Só admins/owner podem alterar permissões
CREATE POLICY "cs upsert admin" ON public.community_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
       WHERE cm.community_id = community_settings.community_id
         AND cm.user_id = auth.uid()
         AND cm.role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_settings.community_id
         AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_members cm
       WHERE cm.community_id = community_settings.community_id
         AND cm.user_id = auth.uid()
         AND cm.role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_settings.community_id
         AND c.owner_id = auth.uid()
    )
  );

-- ── community_rules ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  rule_text     text NOT NULL,
  order_index   int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_rules ENABLE ROW LEVEL SECURITY;

-- Todos podem ler regras de comunidades públicas; membros lêem de privadas
CREATE POLICY "cr select all" ON public.community_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_rules.community_id
         AND (
           c.privacy = 'public'
           OR c.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = c.id AND cm.user_id = auth.uid()
           )
         )
    )
  );

-- Só admins/owner podem gerir regras
CREATE POLICY "cr admin all" ON public.community_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_rules.community_id
         AND (
           c.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = c.id AND cm.user_id = auth.uid()
                AND cm.role IN ('owner','admin')
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_rules.community_id
         AND (
           c.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = c.id AND cm.user_id = auth.uid()
                AND cm.role IN ('owner','admin')
           )
         )
    )
  );

-- ── community_bans ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_bans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE public.community_bans ENABLE ROW LEVEL SECURITY;

-- Admins/owner podem ver e gerir bans
CREATE POLICY "cb admin all" ON public.community_bans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_bans.community_id
         AND (
           c.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = c.id AND cm.user_id = auth.uid()
                AND cm.role IN ('owner','admin','moderator')
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_bans.community_id
         AND (
           c.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = c.id AND cm.user_id = auth.uid()
                AND cm.role IN ('owner','admin','moderator')
           )
         )
    )
  );

-- ── community_mutes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_mutes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_until   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE public.community_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmu admin all" ON public.community_mutes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_mutes.community_id
         AND (
           c.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = c.id AND cm.user_id = auth.uid()
                AND cm.role IN ('owner','admin','moderator')
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.communities c
       WHERE c.id = community_mutes.community_id
         AND (
           c.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.community_members cm
              WHERE cm.community_id = c.id AND cm.user_id = auth.uid()
                AND cm.role IN ('owner','admin','moderator')
           )
         )
    )
  );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_community_settings_cid ON public.community_settings(community_id);
CREATE INDEX IF NOT EXISTS idx_community_rules_cid    ON public.community_rules(community_id);
CREATE INDEX IF NOT EXISTS idx_community_bans_cid_uid ON public.community_bans(community_id, user_id);
CREATE INDEX IF NOT EXISTS idx_community_mutes_cid_uid ON public.community_mutes(community_id, user_id);
