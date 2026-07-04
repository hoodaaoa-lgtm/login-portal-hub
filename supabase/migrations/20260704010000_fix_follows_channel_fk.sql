-- Corrige o botão "Seguir" de canais: follows.following_id tinha uma FK apontando
-- só para auth.users(id), mas o app usa essa mesma coluna para seguir canais
-- (canal.$handle.tsx insere following_id = channels.id). Isso quebrava o insert
-- com violação de foreign key sempre que alguém tentava seguir um canal.

BEGIN;

DO $$
DECLARE fkname text;
BEGIN
  SELECT conname INTO fkname FROM pg_constraint
   WHERE conrelid = 'public.follows'::regclass
     AND contype = 'f'
     AND conname LIKE '%following_id%';
  IF fkname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.follows DROP CONSTRAINT %I', fkname);
  END IF;
END$$;

-- following_id passa a ser um uuid livre: pode ser o id de um perfil (auth.users)
-- ou o id de um canal (public.channels), dependendo do que está a ser seguido.
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows(following_id);

COMMIT;
