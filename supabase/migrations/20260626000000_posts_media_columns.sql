-- Adicionar colunas de media à tabela posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS photos jsonb;
