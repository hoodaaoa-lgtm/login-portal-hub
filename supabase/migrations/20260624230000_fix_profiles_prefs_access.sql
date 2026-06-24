-- Fix: garantir que utilizadores autenticados podem ler e escrever as suas preferências
-- O column-level GRANT anterior não incluía read_receipts_off e hide_last_seen

-- Adicionar colunas de prefs ao column-level grant (SELECT)
GRANT SELECT (read_receipts_off, hide_last_seen) ON public.profiles TO authenticated;

-- Garantir que UPDATE das próprias colunas de prefs funciona
-- A policy "profiles read auth" só tem USING, precisamos de WITH CHECK para UPDATE
DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
