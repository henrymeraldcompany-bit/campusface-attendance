begin;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (char_length(btrim(name)) between 2 and 120),
  is_active boolean not null default true,
  created_by uuid references public.staff_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.courses is
  'University course catalogue. Courses are deactivated rather than deleted so future enrolment and attendance history can retain references.';
comment on column public.courses.created_by is
  'Staff profile that created the course; null for the initial system catalogue.';

create unique index courses_name_case_insensitive_uidx
  on public.courses (lower(btrim(name)));

create index courses_active_name_idx
  on public.courses (is_active, lower(name));

create or replace function private.touch_course_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

revoke all on function private.touch_course_updated_at()
  from public, anon, authenticated;

create trigger courses_touch_updated_at
before update on public.courses
for each row
execute function private.touch_course_updated_at();

alter table public.courses enable row level security;

revoke all on table public.courses from public, anon, authenticated;
grant select on table public.courses to authenticated;
grant insert (name) on table public.courses to authenticated;
grant update (name, is_active) on table public.courses to authenticated;
grant all on table public.courses to service_role;

create policy "Active staff can read active courses"
on public.courses
for select
to authenticated
using (
  is_active
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
);

create policy "Administrators can read all courses"
on public.courses
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role = 'administrator'
  )
);

create policy "Administrators can add courses"
on public.courses
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role = 'administrator'
  )
);

create policy "Administrators can update courses"
on public.courses
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role = 'administrator'
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role = 'administrator'
  )
);

insert into public.courses (name, created_by)
select seed.name, null::uuid
from (
  values
    ('English'),
    ('Mathematics'),
    ('Igbo'),
    ('Physics'),
    ('Chemistry'),
    ('Biology'),
    ('Government'),
    ('Commerce'),
    ('Literature in English')
) as seed(name)
where not exists (
  select 1
  from public.courses existing
  where lower(btrim(existing.name)) = lower(btrim(seed.name))
);

commit;
