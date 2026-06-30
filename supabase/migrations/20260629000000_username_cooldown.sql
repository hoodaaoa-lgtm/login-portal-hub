-- Adicionar coluna para registar quando o username foi trocado pela última vez
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
