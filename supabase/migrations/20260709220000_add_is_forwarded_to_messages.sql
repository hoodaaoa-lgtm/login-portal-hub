-- Adiciona a coluna is_forwarded à tabela messages, para marcar mensagens
-- que chegaram através da função "Encaminhar" (mostra a etiqueta
-- "Encaminhada" na bolha, igual ao WhatsApp).
alter table public.messages
  add column if not exists is_forwarded boolean not null default false;
