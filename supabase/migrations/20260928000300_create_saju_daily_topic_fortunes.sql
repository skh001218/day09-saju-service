create table public.saju_daily_topic_fortunes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  birth_date date not null check (birth_date >= date '1990-01-01'),
  birth_time time without time zone not null,
  fortune_date date not null,
  today_pillar text not null check (char_length(today_pillar) = 2),
  money text not null check (char_length(regexp_replace(money, '[[:space:]]', '', 'g')) between 10 and 300),
  health text not null check (char_length(regexp_replace(health, '[[:space:]]', '', 'g')) between 10 and 300),
  work text not null check (char_length(regexp_replace(work, '[[:space:]]', '', 'g')) between 10 and 300),
  fortune_version integer not null check (fortune_version > 0),
  model text not null check (char_length(btrim(model)) > 0),
  created_at timestamptz not null default now(),
  constraint saju_daily_topic_fortunes_day_unique unique (user_id, birth_date, birth_time, fortune_date)
);

alter table public.saju_daily_topic_fortunes enable row level security;
revoke all on table public.saju_daily_topic_fortunes from anon, authenticated;
grant select, insert on table public.saju_daily_topic_fortunes to authenticated;

create policy "Owners can read their daily topic fortunes"
  on public.saju_daily_topic_fortunes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners can insert their daily topic fortunes"
  on public.saju_daily_topic_fortunes for insert to authenticated
  with check (user_id = (select auth.uid()));
