begin;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null
    check (char_length(btrim(full_name)) between 2 and 120),
  registration_number text not null
    check (char_length(btrim(registration_number)) between 2 and 60),
  gender text not null
    check (gender in ('female', 'male')),
  faculty text not null
    check (char_length(btrim(faculty)) between 2 and 120),
  department text not null
    check (char_length(btrim(department)) between 2 and 120),
  created_by uuid not null default auth.uid()
    references public.staff_profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.students is
  'Student academic records. Students do not receive Supabase Auth accounts. Access is restricted to active authorised staff.';
comment on column public.students.registration_number is
  'Unique institutional student registration number; uniqueness is case-insensitive and ignores surrounding spaces.';

create unique index students_registration_number_normalized_uidx
  on public.students (lower(btrim(registration_number)));
create index students_full_name_idx
  on public.students (lower(full_name));
create index students_created_by_idx
  on public.students (created_by);

create table public.student_courses (
  student_id uuid not null references public.students (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  enrolled_by uuid not null default auth.uid()
    references public.staff_profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (student_id, course_id)
);

comment on table public.student_courses is
  'Course enrolments for students. Composite primary key prevents duplicate enrolment in the same course.';

create index student_courses_course_id_idx
  on public.student_courses (course_id);

create or replace function private.touch_student_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

revoke all on function private.touch_student_updated_at()
  from public, anon, authenticated;

create trigger students_touch_updated_at
before update on public.students
for each row
execute function private.touch_student_updated_at();

alter table public.students enable row level security;
alter table public.student_courses enable row level security;

revoke all on table public.students from public, anon, authenticated;
revoke all on table public.student_courses from public, anon, authenticated;

grant select on table public.students to authenticated;
grant insert (full_name, registration_number, gender, faculty, department, created_by)
  on table public.students to authenticated;
grant update (full_name, registration_number, gender, faculty, department)
  on table public.students to authenticated;

grant select on table public.student_courses to authenticated;
grant insert (student_id, course_id, enrolled_by)
  on table public.student_courses to authenticated;

grant all on table public.students to service_role;
grant all on table public.student_courses to service_role;

create policy "Active staff can read student records"
on public.students
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
);

create policy "Active staff can register students"
on public.students
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
);

create policy "Active staff can update student records"
on public.students
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
)
with check (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
);

create policy "Active staff can read student course enrolments"
on public.student_courses
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
);

create policy "Active staff can assign active courses to students"
on public.student_courses
for insert
to authenticated
with check (
  enrolled_by = (select auth.uid())
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
  and exists (
    select 1 from public.courses c
    where c.id = course_id and c.is_active = true
  )
);

create or replace function public.register_student(
  p_full_name text,
  p_registration_number text,
  p_gender text,
  p_faculty text,
  p_department text,
  p_course_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_student_id uuid;
  v_unique_course_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to register a student'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  ) then
    raise exception 'Only active authorised staff can register students'
      using errcode = '42501';
  end if;

  if p_course_ids is null or cardinality(p_course_ids) = 0 then
    raise exception 'Select at least one active course for the student'
      using errcode = '22023';
  end if;

  if cardinality(p_course_ids) > 100 then
    raise exception 'The selected course list is too large'
      using errcode = '22023';
  end if;

  select count(distinct requested.course_id)::integer
  into v_unique_course_count
  from unnest(p_course_ids) as requested(course_id);

  if v_unique_course_count <> cardinality(p_course_ids) then
    raise exception 'A course was selected more than once'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_course_ids) as requested(course_id)
    left join public.courses c on c.id = requested.course_id
    where c.id is null or c.is_active = false
  ) then
    raise exception 'One or more selected courses are unavailable'
      using errcode = '22023';
  end if;

  insert into public.students (
    full_name,
    registration_number,
    gender,
    faculty,
    department,
    created_by
  )
  values (
    btrim(p_full_name),
    btrim(p_registration_number),
    p_gender,
    btrim(p_faculty),
    btrim(p_department),
    auth.uid()
  )
  returning id into v_student_id;

  insert into public.student_courses (student_id, course_id, enrolled_by)
  select v_student_id, requested.course_id, auth.uid()
  from unnest(p_course_ids) as requested(course_id);

  return v_student_id;
end;
$function$;

revoke all on function public.register_student(text, text, text, text, text, uuid[])
  from public, anon;
grant execute on function public.register_student(text, text, text, text, text, uuid[])
  to authenticated;

commit;