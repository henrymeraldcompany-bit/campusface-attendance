begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.staff_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
    check (char_length(btrim(full_name)) between 2 and 120),
  staff_role text not null
    check (staff_role in ('lecturer', 'administrator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_profiles is
  'Staff-only profile records. Students do not receive Auth accounts or rows in this table.';
comment on column public.staff_profiles.id is
  'Matches the Supabase Auth user UUID. Staff accounts must be provisioned by a trusted administrator.';
comment on column public.staff_profiles.staff_role is
  'Authorization role. Must be assigned by a trusted server-side process; clients cannot insert or update this column.';
comment on column public.staff_profiles.is_active is
  'When false, the staff member is suspended from application access.';

create or replace function private.touch_staff_profile_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

create trigger staff_profiles_touch_updated_at
before update on public.staff_profiles
for each row
execute function private.touch_staff_profile_updated_at();

alter table public.staff_profiles enable row level security;

revoke all on table public.staff_profiles from public, anon, authenticated;
grant select on table public.staff_profiles to authenticated;
grant select, insert, update, delete on table public.staff_profiles to service_role;

create policy "Staff can read only their own profile"
on public.staff_profiles
for select
to authenticated
using ((select auth.uid()) = id);

commit;
