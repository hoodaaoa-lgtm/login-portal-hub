-- Defesa em profundidade: o servidor recusa mensagens de comunidade não cifradas.
-- Toda nova mensagem TEM de ter content começando com "e2ee:" e is_encrypted=true.
-- Mensagens antigas (legadas, em claro) continuam legíveis porque a constraint
-- só se aplica a inserts/updates futuros que violem a regra.

CREATE OR REPLACE FUNCTION public.enforce_community_message_encryption()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS NULL OR NEW.content NOT LIKE 'e2ee:%' THEN
    RAISE EXCEPTION 'Mensagens de comunidade têm de ser cifradas (prefixo "e2ee:" obrigatório).';
  END IF;
  -- Força a flag a refletir a realidade
  NEW.is_encrypted := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_messages_require_e2ee ON public.community_messages;
CREATE TRIGGER community_messages_require_e2ee
  BEFORE INSERT OR UPDATE OF content ON public.community_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_community_message_encryption();