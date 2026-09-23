create table public.saju_interpretations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  birth_date date not null check (birth_date >= date '1990-01-01'),
  birth_time time without time zone not null,
  chart jsonb not null check (jsonb_typeof(chart) = 'object'),
  personality text not null check (char_length(btrim(personality)) between 10 and 300),
  strengths text not null check (char_length(btrim(strengths)) between 10 and 300),
  cautions text not null check (char_length(btrim(cautions)) between 10 and 300),
  model text not null check (char_length(btrim(model)) between 1 and 100),
  created_at timestamptz not null default now(),
  constraint saju_interpretations_request_unique unique (user_id, request_id)
);

create index saju_interpretations_user_created_idx
  on public.saju_interpretations (user_id, created_at desc, id desc);

alter table public.saju_interpretations enable row level security;

revoke all on table public.saju_interpretations from anon, authenticated;
grant select, insert, delete on table public.saju_interpretations to authenticated;

create policy "Owners can read their interpretations"
  on public.saju_interpretations for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owners can insert their interpretations"
  on public.saju_interpretations for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Owners can delete their interpretations"
  on public.saju_interpretations for delete to authenticated
  using (user_id = (select auth.uid()));
