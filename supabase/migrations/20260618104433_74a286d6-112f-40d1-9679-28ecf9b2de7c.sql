
-- Destravar build: stories precisa destas colunas
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS author_username text;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS author_color text DEFAULT '#5B3FCF';
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS story_data jsonb;

-- Perfil: telefone, website, localização
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON public.profiles(phone_number) WHERE phone_number IS NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;

-- Garantir leitura pública (autenticada) de perfis para pesquisa
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles read auth" ON public.profiles;
CREATE POLICY "profiles read auth" ON public.profiles FOR SELECT TO authenticated USING (true);
