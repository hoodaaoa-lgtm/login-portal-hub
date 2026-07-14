-- ═══════════════════════════════════════════════════════════════════════
-- FIX: quando a migration 20260714120000_sistema_redes.sql foi corrida
-- diretamente no SQL Editor, as funções (rede_entrar, rede_sair, etc.)
-- ficaram criadas na base de dados mas invisíveis para a API (PostgREST),
-- porque essa camada só atualiza a lista de funções disponíveis quando é
-- avisada. Isto fazia o botão "Entrar" (e outros) não fazerem nada — a
-- chamada falhava silenciosamente por a API não reconhecer a função.
--
-- Esta migration não muda nenhuma lógica, só força esse aviso.
-- ═══════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
