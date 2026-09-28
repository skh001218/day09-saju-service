create table public.saju_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null check (birth_date >= date '1990-01-01'),
  birth_time time without time zone not null,
  updated_at timestamptz not null default now()
);

create table public.daily_fortunes (
  user_id uuid not null references auth.users(id) on delete cascade,
  fortune_date date not null,
  today_pillar text not null,
  flow text not null,
  action text not null,
  caution text not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, fortune_date)
);

alter table public.saju_profiles enable row level security;
alter table public.daily_fortunes enable row level security;

revoke all on public.saju_profiles from anon, authenticated;
revoke all on public.daily_fortunes from anon, authenticated;
grant select on public.saju_profiles to authenticated;
grant select on public.daily_fortunes to authenticated;
grant select, insert, update, delete on public.saju_profiles to service_role;
grant select, insert, update, delete on public.daily_fortunes to service_role;

create policy "Owners can read their saju profile"
  on public.saju_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owners can read their daily fortunes"
  on public.daily_fortunes for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.saju_profiles (user_id, birth_date, birth_time, updated_at)
select distinct on (user_id) user_id, birth_date, birth_time, created_at
from public.saju_interpretations
order by user_id, created_at desc, id desc
on conflict (user_id) do nothing;
