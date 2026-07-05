-- Adiciona a escolha de tipo de letra (fonte) para a assinatura do canal
ALTER TABLE channels ADD COLUMN IF NOT EXISTS signature_font TEXT DEFAULT 'padrao';
