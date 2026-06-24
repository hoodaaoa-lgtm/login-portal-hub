ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS community_members_id_uidx ON public.community_members(id);