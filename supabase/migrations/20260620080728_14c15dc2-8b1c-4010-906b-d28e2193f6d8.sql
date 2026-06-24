
-- 1. Tighten always-true UPDATE/INSERT policies
DROP POLICY IF EXISTS "Authenticated can update community" ON public.communities;
CREATE POLICY "Members can update community" ON public.communities
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_members m WHERE m.community_id = communities.id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.community_members m WHERE m.community_id = communities.id AND m.user_id = auth.uid()));

DROP POLICY IF EXISTS "Anyone can update counters" ON public.library_books;
CREATE POLICY "Authenticated can update counters" ON public.library_books
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "conv insert auth" ON public.conversations;
CREATE POLICY "conv insert auth" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cp insert own" ON public.conversation_participants;
CREATE POLICY "cp insert own" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. Function search_path hardening
CREATE OR REPLACE FUNCTION public.sync_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.posts set likes_count = likes_count + 1 where id = new.post_id;
  else
    update public.posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.profiles
  SET last_seen = now(), is_online = true
  WHERE id = auth.uid();
$function$;

-- 3. Drop overly broad public SELECT on messages-media (public bucket URLs still work)
DROP POLICY IF EXISTS "messages media read" ON storage.objects;
