-- Stories table: stores published user stories
CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_username text NOT NULL,
  author_color text NOT NULL DEFAULT '#5B3FCF',
  story_data jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stories read all authed"
  ON public.stories FOR SELECT TO authenticated USING (true);

CREATE POLICY "stories insert own"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "stories update own"
  ON public.stories FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "stories delete own"
  ON public.stories FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-delete expired stories
CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.stories
  WHERE expires_at IS NOT NULL AND expires_at < now();
END;
$$;
