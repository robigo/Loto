-- PREPARATION ONLY. Applying this changes permissions and requires owner approval.
-- Populate approved UUIDs in this transaction before COMMIT, or all cloud access is denied.
begin;
create table public.loto_approved_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.loto_approved_users enable row level security;
revoke all on public.loto_approved_users from public, anon, authenticated;
grant select on public.loto_approved_users to authenticated;
create policy "See own approval only" on public.loto_approved_users
  for select to authenticated using (user_id = (select auth.uid()));
-- A RESTRICTIVE policy ANDs with the existing ownership policy from 001.
-- Do not add another permissive policy: those combine with OR.
create policy "Approved Loto accounts required" on public.loto_saved_forms
  as restrictive for all to authenticated
  using (exists (select 1 from public.loto_approved_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.loto_approved_users a where a.user_id = (select auth.uid())));
-- Operator only, after verifying existing Google identity UUIDs in auth.users:
-- insert into public.loto_approved_users(user_id) values ('VERIFIED-UUID');
commit;
