
-- POSTS
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_username text NOT NULL,
  author_name text,
  author_color text DEFAULT '#5B3FCF',
  category text DEFAULT 'general',
  content text NOT NULL,
  kind text DEFAULT 'post',
  is_ad boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts read all authed" ON public.posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "posts insert own" ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts update own" ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts delete own" ON public.posts FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- LIKES
CREATE TABLE public.post_likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes read" ON public.post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "likes insert own" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes delete own" ON public.post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- SAVES
CREATE TABLE public.post_saves (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_saves TO authenticated;
GRANT ALL ON public.post_saves TO service_role;
ALTER TABLE public.post_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saves read own" ON public.post_saves FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "saves insert own" ON public.post_saves FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "saves delete own" ON public.post_saves FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- COMMENTS
CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_username text NOT NULL,
  author_color text DEFAULT '#5B3FCF',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.post_comments TO authenticated;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments read" ON public.post_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments insert own" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments delete own" ON public.post_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- FOLLOWS (segue username; pode ser conta demo ou real)
CREATE TABLE public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, target_username)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows read" ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "follows insert own" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows delete own" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- SEED demo posts (sem author_id; aparecem para todos)
INSERT INTO public.posts (id, author_username, author_name, author_color, category, content, kind, is_ad) VALUES
('11111111-1111-1111-1111-000000000001','ana.reads','Ana M.','#5B3FCF','books','“Toda história começa onde uma outra se cala.” — capítulo 1 do meu novo livro 🌒','quote',false),
('11111111-1111-1111-1111-000000000002','Editora Aurora','Editora Aurora','#F26B3A','general','Pré-venda aberta: «Cidade de Vidro» com 30% off só esta semana.','post',true),
('11111111-1111-1111-1111-000000000003','joaowriter','João P.','#F26B3A','books','Comecei a escrever às 5 da manhã e não parei. Quem mais escreve no escuro?','post',false),
('11111111-1111-1111-1111-000000000004','biblio.club','Bibliófilos','#1FAFA6','books','Clube de leitura desta semana: Dostoiévski. Entra e participa do debate 📚','post',false),
-- Categorias
('22222222-2222-2222-2222-000000000001','poesia.diária','Poesia Diária','#E94B8A','poesia','"O silêncio tem um som
que só os poetas ouvem."','post',false),
('22222222-2222-2222-2222-000000000002','ana.reads','Ana M.','#5B3FCF','poesia','Escrevi um haiku às 3 da manhã e chorei. 🌒','post',false),
('22222222-2222-2222-2222-000000000003','joaowriter','João P.','#F26B3A','romance','Capítulo 12 já disponível! Lara e Marco finalmente se encontram... 💛','post',false),
('22222222-2222-2222-2222-000000000004','biblio.club','Bibliófilos','#1FAFA6','romance','Top 5 romances de 2025 que não podes perder 📚','post',false),
('22222222-2222-2222-2222-000000000005','criativos','Criativos','#5B3FCF','ficcao','E se o tempo andasse para trás em dias de chuva? A minha nova história começa assim.','post',false),
('22222222-2222-2222-2222-000000000006','noites_lit','Noites Literárias','#E94B8A','ficcao','Ficção científica lusófona está a crescer muito! Orgulho 🚀','post',false),
('22222222-2222-2222-2222-000000000007','biblio.club','Bibliófilos','#1FAFA6','drama','Drama histórico: o que aconteceu em Lisboa em 1755 vista pelos olhos de uma criança.','post',false),
('22222222-2222-2222-2222-000000000008','trending','Trending','#F26B3A','autoajuda','3 hábitos de escritores produtivos que mudaram a minha vida ✍️','post',false),
('22222222-2222-2222-2222-000000000009','noites_lit','Noites Literárias','#E94B8A','misterio','Escrevi um thriller de 3000 palavras ontem à noite e ainda não sei quem é o assassino 😅','post',false),
('22222222-2222-2222-2222-00000000000a','trending','Trending','#F26B3A','culinaria','Escrevi um conto inteiro sobre um restaurante mágico em Lisboa. A comida tem poderes... 🍽️','post',false),
('22222222-2222-2222-2222-00000000000b','noites_lit','Noites Literárias','#5B3FCF','fantasia','Dragons, feiticeiras e Lisboa: o meu novo mundo de fantasia lusófona 🐉','post',false);
