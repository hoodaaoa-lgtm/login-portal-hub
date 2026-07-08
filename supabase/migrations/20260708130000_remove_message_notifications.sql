-- Mensagens deixam de gerar notificações no sino — ficam só na aba
-- Mensagens (que já tem o seu próprio contador de não lidas, via
-- BadgeContext, direto na tabela `messages`). O sino de notificações é só
-- para seguidores, likes, comentários, menções, etc.

DROP TRIGGER IF EXISTS on_message_notify ON public.messages;
DROP FUNCTION IF EXISTS public.trg_notify_message();

-- Limpa notificações de mensagem já existentes, para não ficarem
-- "presas" na lista/contador de quem já as tinha por ler.
DELETE FROM public.notifications WHERE type = 'message';
