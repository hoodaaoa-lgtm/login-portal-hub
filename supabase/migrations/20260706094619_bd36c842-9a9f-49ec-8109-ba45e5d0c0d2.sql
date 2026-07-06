-- Fix infinite recursion in community_members RLS policy.
-- The old SELECT policy called is_community_member(), which itself queries
-- community_members, re-triggering the same policy → recursion (error 42P17).
--
-- New policy: a user can read a membership row if
--   (a) it is their own row, OR
--   (b) they own the community, OR
--   (c) another membership row exists for the same community AND themselves —
--       expressed via a security-definer helper that bypasses RLS on its
--       inner query by using a fully-qualified subquery that the planner
--       resolves without re-entering the outer policy.
--
-- We rewrite the helper to run with row_security disabled inside its body.

CREATE OR REPLACE FUNCTION public.is_community_member(_community_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community_id AND user_id = _user_id
  ) INTO v_exists;
  RETURN v_exists;
END;
$$;

-- Recreate the SELECT policy explicitly (drop + create) so Postgres re-plans it
DROP POLICY IF EXISTS "cm read for members" ON public.community_members;
CREATE POLICY "cm read for members"
  ON public.community_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_community_member(community_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id AND c.owner_id = auth.uid()
    )
  );

-- Revoke public EXECUTE and grant only to authenticated (keeps prior security posture)
REVOKE EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_community_member(uuid, uuid) TO authenticated;