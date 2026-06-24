-- Corrige a entrega de chave E2EE: a policy de UPDATE anterior só permitia
-- ao próprio sender_id já gravado actualizar a linha, o que bloqueava o
-- upsert quando um membro diferente respondia a um pedido de chave para o
-- mesmo destinatário (ex: o membro original está offline e outro responde).
-- Isto causava o "Não foi possível decifrar" a ficar permanente em alguns casos.
DROP POLICY IF EXISTS "cks update member" ON public.community_key_shares;
CREATE POLICY "cks update member" ON public.community_key_shares
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = community_key_shares.community_id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = community_key_shares.community_id
        AND user_id = auth.uid()
    )
  );
