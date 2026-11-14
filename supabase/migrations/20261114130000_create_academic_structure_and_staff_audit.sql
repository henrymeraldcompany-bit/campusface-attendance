begin;

alter table public.staff_profiles add column if not exists email text;

update public.staff_profiles sp
set email = lower(u.email)
from auth.users u
where u.id = sp.id
  and sp.email is null
  and u.email is not null;

alter table public.staff_profiles
  alter column email set not null;

create unique index if not exists staff_profiles_email_normalized_uidx
  on public.staff_profiles (lower(btrim(email)));

comment on column public.staff_profiles.email is
  'Normalised staff contact/login email. Staff identity and access changes are made through the trusted staff-management Edge Function.';

create table public.faculties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid()
    references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.faculties is
  'Institution academic faculty catalogue. Deactivate rather than delete to preserve linked department and student history.';

create unique index faculties_name_normalized_uidx
  on public.faculties (lower(btrim(name)));
create index faculties_active_name_idx
  on public.faculties (is_active, lower(name));
create index faculties_created_by_idx
  on public.faculties (created_by);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculties(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid()
    references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.departments is
  'Department catalogue grouped under a faculty. Department names are unique within each faculty.';

create unique index departments_faculty_name_normalized_uidx
  on public.departments (faculty_id, lower(btrim(name)));
create index departments_faculty_active_name_idx
  on public.departments (faculty_id, is_active, lower(name));
create index departments_created_by_idx
  on public.departments (created_by);

create or replace function private.touch_academic_catalogue_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

revoke all on function private.touch_academic_catalogue_updated_at()
  from public, anon, authenticated;

create trigger faculties_touch_updated_at
before update on public.faculties
for each row execute function private.touch_academic_catalogue_updated_at();

create trigger departments_touch_updated_at
before update on public.departments
for each row execute function private.touch_academic_catalogue_updated_at();

alter table public.faculties enable row level security;
alter table public.departments enable row level security;

revoke all on table public.faculties from public, anon, authenticated;
revoke all on table public.departments from public, anon, authenticated;

grant select on public.faculties to authenticated;
grant insert (name, created_by) on public.faculties to authenticated;
grant update (name, is_active) on public.faculties to authenticated;

grant select on public.departments to authenticated;
grant insert (faculty_id, name, created_by) on public.departments to authenticated;
grant update (faculty_id, name, is_active) on public.departments to authenticated;

grant all on public.faculties to service_role;
grant all on public.departments to service_role;

create policy "Staff can read permitted faculties"
on public.faculties for select to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id=(select auth.uid())
      and sp.is_active=true
      and sp.staff_role in ('lecturer','administrator')
      and (public.faculties.is_active=true or sp.staff_role='administrator')
  )
);

create policy "Administrators can add faculties"
on public.faculties for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists (
    select 1 from public.staff_profiles sp
    where sp.id=(select auth.uid()) and sp.is_active=true and sp.staff_role='administrator'
  )
);

create policy "Administrators can update faculties"
on public.faculties for update to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id=(select auth.uid()) and sp.is_active=true and sp.staff_role='administrator'
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id=(select auth.uid()) and sp.is_active=true and sp.staff_role='administrator'
  )
);

create policy "Staff can read permitted departments"
on public.departments for select to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    join public.faculties f on f.id=public.departments.faculty_id
    where sp.id=(select auth.uid())
      and sp.is_active=true
      and sp.staff_role in ('lecturer','administrator')
      and (
        (public.departments.is_active=true and f.is_active=true)
        or sp.staff_role='administrator'
      )
  )
);

create policy "Administrators can add departments"
on public.departments for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists (
    select 1 from public.staff_profiles sp
    join public.faculties f on f.id=public.departments.faculty_id
    where sp.id=(select auth.uid())
      and sp.is_active=true
      and sp.staff_role='administrator'
      and f.is_active=true
  )
);

create policy "Administrators can update departments"
on public.departments for update to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id=(select auth.uid()) and sp.is_active=true and sp.staff_role='administrator'
  )
)
with check (
  exists (
    select 1 from public.staff_profiles sp
    join public.faculties f on f.id=public.departments.faculty_id
    where sp.id=(select auth.uid())
      and sp.is_active=true
      and sp.staff_role='administrator'
      and f.is_active=true
  )
);

create table public.staff_management_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.staff_profiles(id) on delete restrict,
  target_staff_id uuid references public.staff_profiles(id) on delete set null,
  action text not null check (action in ('invited','role_changed','activated','deactivated')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.staff_management_audit is
  'Audit log for staff invitations, role changes and activation/deactivation performed through the trusted staff-management Edge Function.';

create index staff_management_audit_created_idx
  on public.staff_management_audit (created_at desc);
create index staff_management_audit_actor_idx
  on public.staff_management_audit (actor_id, created_at desc);

alter table public.staff_management_audit enable row level security;
revoke all on public.staff_management_audit from public, anon, authenticated;
grant select on public.staff_management_audit to authenticated;
grant all on public.staff_management_audit to service_role;

create policy "Administrators can read staff management audit"
on public.staff_management_audit for select to authenticated
using (
  exists (
    select 1 from public.staff_profiles sp
    where sp.id=(select auth.uid())
      and sp.is_active=true
      and sp.staff_role='administrator'
  )
);

commit;