-- widen role check to include moderator
ALTER TABLE public.community_members DROP CONSTRAINT IF EXISTS community_members_role_check;
ALTER TABLE public.community_members ADD CONSTRAINT community_members_role_check CHECK (role IN ('owner','admin','moderator','member'));

DROP POLICY IF EXISTS "communities update own" ON public.communities;
CREATE POLICY "Owner or admin can update community" ON public.communities FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = communities.id AND cm.user_id = auth.uid() AND cm.role IN ('admin','owner')))
  WITH CHECK (auth.uid() = owner_id OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = communities.id AND cm.user_id = auth.uid() AND cm.role IN ('admin','owner')));

CREATE OR REPLACE FUNCTION public.enforce_community_message_encryption()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.content IS NULL OR NEW.content NOT LIKE 'e2ee:%' THEN
    RAISE EXCEPTION 'Mensagens de comunidade têm de ser cifradas (prefixo "e2ee:" obrigatório).';
  END IF;
  NEW.is_encrypted := true;
  RETURN NEW;
END;
$$;

INSERT INTO public.community_members (community_id, user_id, role)
SELECT c.id, c.owner_id, 'owner' FROM public.communities c
WHERE c.owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = c.id AND cm.user_id = c.owner_id)
ON CONFLICT (community_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.community_settings (
  community_id uuid PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
  who_can_post text NOT NULL DEFAULT 'all',
  who_can_comment text NOT NULL DEFAULT 'all',
  can_send_images boolean NOT NULL DEFAULT true,
  can_send_videos boolean NOT NULL DEFAULT true,
  can_share_links boolean NOT NULL DEFAULT true,
  posts_need_approval boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_settings TO authenticated;
GRANT ALL ON public.community_settings TO service_role;
ALTER TABLE public.community_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs select member" ON public.community_settings FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = community_settings.community_id AND cm.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_settings.community_id AND (c.privacy = 'public' OR c.owner_id = auth.uid()))
);
CREATE POLICY "cs upsert admin" ON public.community_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = community_settings.community_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin'))
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_settings.community_id AND c.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = community_settings.community_id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin'))
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_settings.community_id AND c.owner_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.community_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  rule_text text NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_rules TO authenticated;
GRANT ALL ON public.community_rules TO service_role;
ALTER TABLE public.community_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr select all" ON public.community_rules FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_rules.community_id AND (c.privacy = 'public' OR c.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = c.id AND cm.user_id = auth.uid())))
);
CREATE POLICY "cr admin all" ON public.community_rules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_rules.community_id AND (c.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = c.id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin')))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_rules.community_id AND (c.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = c.id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin')))));

CREATE TABLE IF NOT EXISTS public.community_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_bans TO authenticated;
GRANT ALL ON public.community_bans TO service_role;
ALTER TABLE public.community_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cb admin all" ON public.community_bans FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_bans.community_id AND (c.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = c.id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','moderator')))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_bans.community_id AND (c.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = c.id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','moderator')))));

CREATE TABLE IF NOT EXISTS public.community_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_mutes TO authenticated;
GRANT ALL ON public.community_mutes TO service_role;
ALTER TABLE public.community_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmu admin all" ON public.community_mutes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_mutes.community_id AND (c.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = c.id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','moderator')))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_mutes.community_id AND (c.owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.community_id = c.id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin','moderator')))));

CREATE INDEX IF NOT EXISTS idx_community_settings_cid ON public.community_settings(community_id);
CREATE INDEX IF NOT EXISTS idx_community_rules_cid ON public.community_rules(community_id);
CREATE INDEX IF NOT EXISTS idx_community_bans_cid_uid ON public.community_bans(community_id, user_id);
CREATE INDEX IF NOT EXISTS idx_community_mutes_cid_uid ON public.community_mutes(community_id, user_id);

-- chat-media storage policies (bucket created via storage tool)
CREATE POLICY "chat media upload own folder" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]
  AND (EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.user_id = auth.uid() AND cm.community_id::text = (storage.foldername(name))[2])
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.owner_id = auth.uid() AND c.id::text = (storage.foldername(name))[2]))
);
CREATE POLICY "chat media read members" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'chat-media'
  AND (EXISTS (SELECT 1 FROM public.community_members cm WHERE cm.user_id = auth.uid() AND cm.community_id::text = (storage.foldername(name))[2])
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.owner_id = auth.uid() AND c.id::text = (storage.foldername(name))[2]))
);
CREATE POLICY "chat media delete own" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "cks insert member" ON public.community_key_shares;
CREATE POLICY "cks insert member" ON public.community_key_shares FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND (
    EXISTS (SELECT 1 FROM public.community_members WHERE community_id = community_key_shares.community_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_key_shares.community_id AND c.owner_id = auth.uid())
  )
);