grant update (money, health, work, fortune_version, model)
  on table public.saju_daily_topic_fortunes to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'saju_daily_topic_fortunes'
      and policyname = 'Owners can refresh duplicate daily topic fortunes'
  ) then
    create policy "Owners can refresh duplicate daily topic fortunes"
      on public.saju_daily_topic_fortunes for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end
$$;
