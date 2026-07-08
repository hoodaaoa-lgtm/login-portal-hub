-- Garantir que a extensão pg_net está ativa
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trg_dispatch_push()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM extensions.http_post(
    url     := 'https://noespkhtwerarazwozqv.supabase.co/functions/v1/send-push',
    headers := '{"Content-type":"application/json"}'::jsonb,
    body    := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- nunca bloquear a notificação por causa do push
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

DROP TRIGGER IF EXISTS on_notification_dispatch_push ON public.notifications;
CREATE TRIGGER on_notification_dispatch_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_dispatch_push();
