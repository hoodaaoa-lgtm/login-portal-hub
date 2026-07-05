-- ============================================================================
-- FIX: policies de INSERT duplicadas que anulavam proteções importantes
--
-- Problema encontrado na revisão (06/07/2026):
--
-- 1) public.conversations tinha DUAS policies de INSERT em simultâneo:
--    - "conv insert auth"  → WITH CHECK (true)                [sem restrição]
--    - "conv insert"       → WITH CHECK (is_official=false OR admin)
--    No Postgres, policies permissivas combinam-se com OR — bastava UMA
--    passar para o INSERT ser aceite. Como "conv insert auth" não tinha
--    restrição nenhuma, QUALQUER utilizador conseguia criar uma conversa
--    com is_official=true e fazer-se passar por "Hooda Oficial".
--
-- 2) public.messages também tinha DUAS policies de INSERT:
--    - "msg_insert"     → só verifica remetente + participante
--    - "msg insert own" → verifica o mesmo MAIS o bloqueio de resposta
--                          (reply_allowed = false em conversas oficiais)
--    Pelo mesmo motivo, "msg_insert" (mais permissiva) deixava qualquer
--    utilizador responder numa conversa oficial mesmo com as respostas
--    bloqueadas pelo admin — o botão "Resposta bloqueada" não bloqueava
--    mesmo nada na prática.
--
-- Esta migration remove as policies mais fracas, mantendo só a versão
-- completa e restritiva de cada uma.
-- ============================================================================

DROP POLICY IF EXISTS "conv insert auth" ON public.conversations;
DROP POLICY IF EXISTS "msg_insert"        ON public.messages;

-- Fim.
