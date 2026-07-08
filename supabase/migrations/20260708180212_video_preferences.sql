-- Sistema de qualidade de vídeo: preferência global por utilizador
-- quality_mode: 'auto' | 'data_saver' | 'high_quality' | 'manual'
-- preferred_resolution só é usado quando quality_mode = 'manual' (ex: '480p')

create table if not exists public.video_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  quality_mode text not null default 'auto'
    check (quality_mode in ('auto', 'data_saver', 'high_quality', 'manual')),
  preferred_resolution text
    check (preferred_resolution in ('144p','240p','360p','480p','720p','1080p','1440p','4k') or preferred_resolution is null),
  data_saver_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.video_preferences enable row level security;

drop policy if exists "video_preferences_select_own" on public.video_preferences;
create policy "video_preferences_select_own"
  on public.video_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "video_preferences_upsert_own" on public.video_preferences;
create policy "video_preferences_upsert_own"
  on public.video_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "video_preferences_update_own" on public.video_preferences;
create policy "video_preferences_update_own"
  on public.video_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Mantém updated_at correto em cada gravação
create or replace function public.touch_video_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_video_preferences_updated_at on public.video_preferences;
create trigger trg_video_preferences_updated_at
  before update on public.video_preferences
  for each row execute function public.touch_video_preferences_updated_at();

-- RPC de conveniência: grava a preferência num único pedido (upsert atómico)
create or replace function public.set_video_preference(
  p_quality_mode text,
  p_preferred_resolution text default null,
  p_data_saver_enabled boolean default false
)
returns public.video_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.video_preferences;
begin
  insert into public.video_preferences (user_id, quality_mode, preferred_resolution, data_saver_enabled)
  values (auth.uid(), p_quality_mode, p_preferred_resolution, p_data_saver_enabled)
  on conflict (user_id) do update
    set quality_mode = excluded.quality_mode,
        preferred_resolution = excluded.preferred_resolution,
        data_saver_enabled = excluded.data_saver_enabled
  returning * into result;

  return result;
end;
$$;

grant execute on function public.set_video_preference(text, text, boolean) to authenticated;
