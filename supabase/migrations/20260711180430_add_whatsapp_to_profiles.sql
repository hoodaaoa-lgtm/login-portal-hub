-- Adiciona campo WhatsApp ao perfil (visível e editável como bio/website)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp text;

GRANT SELECT (whatsapp) ON public.profiles TO authenticated, anon;
