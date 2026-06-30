-- A política "posts read all authed" restringia leitura da tabela `posts`
-- apenas a utilizadores com sessão totalmente sincronizada no cliente
-- Supabase (TO authenticated). Isto causava falhas silenciosas: o pedido
-- "funcionava" tecnicamente mas devolvia 0 linhas sempre que o token JWT
-- ainda não estava anexado ao cliente no momento exacto da query — fazendo
-- o feed parecer "preso a carregar" mesmo havendo publicações na base de
-- dados. Como a Hooda é uma rede social com feed essencialmente público,
-- a leitura de posts deve ser permitida a qualquer pedido (anon incluído).

DROP POLICY IF EXISTS "posts read all authed" ON public.posts;

CREATE POLICY "posts read all" ON public.posts
  FOR SELECT
  USING (true);
