
-- Restore broad SELECT policy (column grants do the gating)
DROP POLICY IF EXISTS "profiles read own" ON public.profiles;
CREATE POLICY "profiles read auth" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Remove the view created earlier (no longer needed)
DROP VIEW IF EXISTS public.profiles_public;

-- Column-level grants: hide sensitive fields from `authenticated` role.
-- Owner-only access is provided through a SECURITY DEFINER function below.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, username, full_name, age, avatar_url, bio, created_at, updated_at,
  website, location, msg_permission, avatar_color, cover_url,
  is_online, last_seen, is_private, e2ee_public_key
) ON public.profiles TO authenticated;
-- INSERT/UPDATE/DELETE still allowed (RLS limits to own row)
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- Owner reads own sensitive fields via this function
CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE(phone_number text, notification_prefs jsonb, read_receipts_off boolean, hide_last_seen boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT phone_number, notification_prefs, read_receipts_off, hide_last_seen
  FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_profile_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;
