create table public.saju_daily_fortunes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  birth_date date not null check (birth_date >= date '1990-01-01'),
  birth_time time without time zone not null,
  fortune_date date not null,
  today_pillar text not null check (char_length(today_pillar) = 2),
  flow text not null check (char_length(btrim(flow)) between 1 and 300),
  action text not null check (char_length(btrim(action)) between 1 and 300),
  caution text not null check (char_length(btrim(caution)) between 1 and 300),
  fortune_version integer not null check (fortune_version > 0),
  created_at timestamptz not null default now(),
  constraint saju_daily_fortunes_day_unique unique (user_id, birth_date, birth_time, fortune_date)
);

alter table public.saju_daily_fortunes enable row level security;

revoke all on table public.saju_daily_fortunes from anon, authenticated;
grant select, insert on table public.saju_daily_fortunes to authenticated;

create policy "Owners can read their daily fortunes"
  on public.saju_daily_fortunes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners can insert their daily fortunes"
  on public.saju_daily_fortunes for insert to authenticated
  with check (user_id = (select auth.uid()));
