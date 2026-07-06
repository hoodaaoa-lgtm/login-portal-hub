-- ============================================================================
-- Limpeza de tabelas mortas — Stories, Comunidades e resíduos antigos
-- ============================================================================
-- Corre este ficheiro inteiro no Supabase SQL Editor.
-- IRREVERSÍVEL: apaga definitivamente os dados destas tabelas.
--
-- Confirmado antes de gerar este SQL: nenhum ficheiro do código (src/,
-- edge functions) chama qualquer uma destas tabelas. A funcionalidade de
-- Stories foi substituída pelos Drops; Comunidades já não é usada.
-- ============================================================================

-- 1) Feature "Stories" (substituída por Drops)
DROP TABLE IF EXISTS public.stories CASCADE;
DROP TABLE IF EXISTS public.story_chapters CASCADE;
DROP TABLE IF EXISTS public.story_messages CASCADE;
DROP TABLE IF EXISTS public.story_message_notifications CASCADE;

-- 2) Feature "Comunidades" (descontinuada)
DROP TABLE IF EXISTS public.community_messages CASCADE;
DROP TABLE IF EXISTS public.community_key_shares CASCADE;
DROP TABLE IF EXISTS public.community_bans CASCADE;
DROP TABLE IF EXISTS public.community_mutes CASCADE;
DROP TABLE IF EXISTS public.community_rules CASCADE;
DROP TABLE IF EXISTS public.community_settings CASCADE;
DROP TABLE IF EXISTS public.community_members CASCADE;
DROP TABLE IF EXISTS public.community_visits CASCADE;
DROP TABLE IF EXISTS public.community_posts CASCADE;
DROP TABLE IF EXISTS public.communities CASCADE;
DROP FUNCTION IF EXISTS public.mark_community_visited(uuid);

-- 3) Resíduos antigos, já sem qualquer código a usá-los
DROP TABLE IF EXISTS public.library_books CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;

-- 4) Bucket de storage exclusivo do chat de comunidades
DELETE FROM storage.objects WHERE bucket_id = 'chat-media';
DELETE FROM storage.buckets WHERE id = 'chat-media';

-- Fim.
