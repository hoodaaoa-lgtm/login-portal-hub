-- Corrigir o default de msg_permission para 'todos'
-- O default 'seguidores' estava a bloquear novos utilizadores de receberem mensagens
ALTER TABLE public.profiles
  ALTER COLUMN msg_permission SET DEFAULT 'todos';

-- Actualizar perfis existentes que ficaram com 'seguidores' sem o utilizador ter
-- configurado manualmente (apenas se ainda não foram alterados pelo utilizador)
UPDATE public.profiles
  SET msg_permission = 'todos'
  WHERE msg_permission = 'seguidores';
