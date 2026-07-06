-- ============================================================================
-- Registo de auditoria do painel admin (aba "Auditoria")
-- Depende de public.is_hooda_admin(), criada em 20260705000000_official_admin_messages.sql
-- Corre este ficheiro inteiro no Supabase SQL Editor. É seguro correr mais que uma vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,        -- ban, unban, verify, unverify, delete_account,
                                      -- delete_post, delete_channel, report_resolved,
                                      -- report_dismissed, broadcast
  target_type  TEXT,                 -- user, post, channel, report, all_users
  target_label TEXT,                 -- ex.: "@username"
  details      TEXT,                 -- motivo / texto do comunicado / etc.
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log(created_at DESC);

GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read audit log" ON public.admin_audit_log;
CREATE POLICY "admin read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING ( public.is_hooda_admin() );

DROP POLICY IF EXISTS "admin insert audit log" ON public.admin_audit_log;
CREATE POLICY "admin insert audit log" ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK ( public.is_hooda_admin() AND admin_id = auth.uid() );

-- Fim.
