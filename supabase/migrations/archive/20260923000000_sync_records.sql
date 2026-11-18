-- Apply the same migration to the separate staging and production projects.
create table if not exists public.sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('profile', 'sessions', 'mistakes', 'pacingRuns', 'checklist', 'vocabLog', 'shieldDays')),
  record_id text not null check (length(record_id) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, entity_type, record_id)
);

create index if not exists sync_records_user_updated on public.sync_records (user_id, updated_at);
alter table public.sync_records enable row level security;

create policy "Owner reads own records" on public.sync_records for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owner inserts own records" on public.sync_records for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Owner updates own records" on public.sync_records for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner deletes own records" on public.sync_records for delete to authenticated
  using (user_id = (select auth.uid()));

-- Browser writes go through this function so the version comparison happens
-- inside the same database transaction as the update. Direct DML is withheld.
revoke all on public.sync_records from anon, authenticated;
grant select on public.sync_records to authenticated;

create or replace function public.apply_sync_records(p_records jsonb, p_replace boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  item jsonb;
  item_type text;
  item_id text;
  item_updated timestamptz;
  item_deleted timestamptz;
  override_at timestamptz;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 10000 then
    raise exception 'Invalid sync batch';
  end if;
  if p_replace then
    select greatest(clock_timestamp(), coalesce(max(updated_at) + interval '1 millisecond', clock_timestamp()))
      into override_at from public.sync_records where user_id = owner_id;
  end if;

  for item in select value from jsonb_array_elements(p_records) loop
    item_type := item->>'entity_type';
    item_id := item->>'record_id';
    if item_type not in ('profile', 'sessions', 'mistakes', 'pacingRuns', 'checklist', 'vocabLog', 'shieldDays')
       or item_id is null or length(item_id) not between 1 and 200
       or jsonb_typeof(item->'payload') <> 'object' then
      raise exception 'Invalid sync record';
    end if;
    if item_type = 'profile' and item_id <> 'profile' then raise exception 'Invalid profile key'; end if;
    item_updated := case when p_replace then override_at else (item->>'updated_at')::timestamptz end;
    item_deleted := case
      when item->>'deleted_at' is null then null
      when p_replace then override_at
      else (item->>'deleted_at')::timestamptz
    end;
    if item_updated is null then raise exception 'Missing updated_at'; end if;

    insert into public.sync_records as existing (user_id, entity_type, record_id, payload, updated_at, deleted_at)
    values (owner_id, item_type, item_id, item->'payload', item_updated, item_deleted)
    on conflict (user_id, entity_type, record_id) do update set
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
    where p_replace
       or excluded.updated_at > existing.updated_at
       or (excluded.updated_at = existing.updated_at and excluded.deleted_at is not null and existing.deleted_at is null);
  end loop;

  if p_replace then
    update public.sync_records as existing
      set updated_at = override_at, deleted_at = override_at
      where existing.user_id = owner_id
      and not exists (
        select 1 from jsonb_array_elements(p_records) as supplied
        where supplied->>'entity_type' = existing.entity_type and supplied->>'record_id' = existing.record_id
      );
  end if;
end;
$$;

revoke all on function public.apply_sync_records(jsonb, boolean) from public, anon;
grant execute on function public.apply_sync_records(jsonb, boolean) to authenticated;
