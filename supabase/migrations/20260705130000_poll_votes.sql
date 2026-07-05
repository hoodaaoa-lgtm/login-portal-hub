-- Enquetes de verdade: um voto por utilizador por publicação (pode trocar),
-- e prazo opcional escolhido pelo criador.

alter table public.posts
  add column if not exists poll_ends_at timestamptz;

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists idx_poll_votes_post on public.poll_votes(post_id);
create index if not exists idx_poll_votes_user on public.poll_votes(user_id);

alter table public.poll_votes enable row level security;

drop policy if exists "poll_votes_select_all" on public.poll_votes;
create policy "poll_votes_select_all"
  on public.poll_votes for select
  using (true);

drop policy if exists "poll_votes_insert_own" on public.poll_votes;
create policy "poll_votes_insert_own"
  on public.poll_votes for insert
  with check (auth.uid() = user_id);

drop policy if exists "poll_votes_update_own" on public.poll_votes;
create policy "poll_votes_update_own"
  on public.poll_votes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "poll_votes_delete_own" on public.poll_votes;
create policy "poll_votes_delete_own"
  on public.poll_votes for delete
  using (auth.uid() = user_id);
