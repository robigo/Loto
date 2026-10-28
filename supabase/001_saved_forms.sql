-- Apply only to the dedicated Loto Supabase project, before enabling account-config.js.
begin;
create table public.loto_saved_forms (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('regular', 'systematic')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 16000),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.loto_saved_forms enable row level security;
revoke all on public.loto_saved_forms from public, anon, authenticated;
grant select, insert, update, delete on public.loto_saved_forms to authenticated;
create policy "Own saved forms only" on public.loto_saved_forms
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create function public.loto_stamp_saved_form() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger loto_stamp_saved_form before update on public.loto_saved_forms
  for each row execute function public.loto_stamp_saved_form();
commit;
