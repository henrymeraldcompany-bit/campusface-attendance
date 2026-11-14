begin;

create table public.lecturer_course_assignments (
  lecturer_id uuid not null references public.staff_profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  assigned_by uuid not null references public.staff_profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (lecturer_id, course_id)
);

comment on table public.lecturer_course_assignments is
  'Current administrator-managed course assignments for lecturer accounts. Students and lecturers cannot create or change these assignments themselves.';

create index lecturer_course_assignments_course_idx
  on public.lecturer_course_assignments(course_id);

alter table public.lecturer_course_assignments enable row level security;
revoke all on table public.lecturer_course_assignments from public, anon, authenticated;
grant select on table public.lecturer_course_assignments to authenticated;
grant all on table public.lecturer_course_assignments to service_role;

create policy "Staff can read their own course assignments or administrators all"
on public.lecturer_course_assignments
for select to authenticated
using (
  exists (
    select 1
    from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and (
        actor.staff_role = 'administrator'
        or (
          actor.staff_role = 'lecturer'
          and public.lecturer_course_assignments.lecturer_id = actor.id
        )
      )
  )
);

-- A lecturer can now see only active courses assigned by an administrator.
-- Administrators retain access to the full catalogue, including inactive rows.
drop policy if exists "Staff can read permitted courses" on public.courses;

create policy "Staff can read permitted courses"
on public.courses
for select to authenticated
using (
  exists (
    select 1
    from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and (
        actor.staff_role = 'administrator'
        or (
          actor.staff_role = 'lecturer'
          and public.courses.is_active = true
          and exists (
            select 1
            from public.lecturer_course_assignments assignment
            where assignment.lecturer_id = actor.id
              and assignment.course_id = public.courses.id
          )
        )
      )
  )
);

-- Student registration and student-record management belong to administrators.
drop policy if exists "Active staff can read student records" on public.students;
drop policy if exists "Active staff can register students" on public.students;
drop policy if exists "Active staff can update student records" on public.students;

create policy "Administrators can read student records"
on public.students
for select to authenticated
using (
  exists (
    select 1 from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and actor.staff_role = 'administrator'
  )
);

create policy "Administrators can register students"
on public.students
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and actor.staff_role = 'administrator'
  )
);

create policy "Administrators can update student records"
on public.students
for update to authenticated
using (
  exists (
    select 1 from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and actor.staff_role = 'administrator'
  )
)
with check (
  exists (
    select 1 from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and actor.staff_role = 'administrator'
  )
);

drop policy if exists "Active staff can assign active courses to students" on public.student_courses;
drop policy if exists "Active staff can read student course enrolments" on public.student_courses;
drop policy if exists "Active staff can remove student course enrolments" on public.student_courses;

create policy "Administrators can assign active courses to students"
on public.student_courses
for insert to authenticated
with check (
  enrolled_by = (select auth.uid())
  and exists (
    select 1 from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and actor.staff_role = 'administrator'
  )
  and exists (
    select 1 from public.courses course
    where course.id = public.student_courses.course_id
      and course.is_active = true
  )
);

create policy "Administrators can read student course enrolments"
on public.student_courses
for select to authenticated
using (
  exists (
    select 1 from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and actor.staff_role = 'administrator'
  )
);

create policy "Administrators can remove student course enrolments"
on public.student_courses
for delete to authenticated
using (
  exists (
    select 1 from public.staff_profiles actor
    where actor.id = (select auth.uid())
      and actor.is_active = true
      and actor.staff_role = 'administrator'
  )
);

-- The assignment change is atomic: a failed request cannot leave a lecturer
-- with only part of the intended course list.
create or replace function private.set_lecturer_course_assignments(
  p_lecturer_id uuid,
  p_course_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_distinct_count integer;
  v_assigned_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to assign lecturer courses'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.staff_profiles actor
    where actor.id = v_user_id
      and actor.is_active = true
      and actor.staff_role = 'administrator'
  ) then
    raise exception 'Only an active administrator can assign lecturer courses'
      using errcode = '42501';
  end if;

  if p_lecturer_id is null or not exists (
    select 1
    from public.staff_profiles lecturer
    where lecturer.id = p_lecturer_id
      and lecturer.is_active = true
      and lecturer.staff_role = 'lecturer'
  ) then
    raise exception 'Select an active lecturer account'
      using errcode = '22023';
  end if;

  if p_course_ids is null then
    raise exception 'Provide a course list. Use an empty list to remove all assignments.'
      using errcode = '22023';
  end if;

  if cardinality(p_course_ids) > 100 then
    raise exception 'The selected course list is too large'
      using errcode = '22023';
  end if;

  select count(distinct requested.course_id)::integer
  into v_distinct_count
  from unnest(p_course_ids) as requested(course_id);

  if v_distinct_count <> cardinality(p_course_ids) then
    raise exception 'A course was selected more than once'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_course_ids) as requested(course_id)
    left join public.courses course on course.id = requested.course_id
    where course.id is null or course.is_active = false
  ) then
    raise exception 'One or more selected courses are unavailable'
      using errcode = '22023';
  end if;

  delete from public.lecturer_course_assignments
  where lecturer_id = p_lecturer_id;

  insert into public.lecturer_course_assignments (
    lecturer_id,
    course_id,
    assigned_by
  )
  select p_lecturer_id, requested.course_id, v_user_id
  from unnest(p_course_ids) as requested(course_id);

  get diagnostics v_assigned_count = row_count;
  return v_assigned_count;
end;
$function$;

revoke all on function private.set_lecturer_course_assignments(uuid, uuid[])
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.set_lecturer_course_assignments(uuid, uuid[])
  to authenticated;

create or replace function public.set_lecturer_course_assignments(
  p_lecturer_id uuid,
  p_course_ids uuid[]
)
returns integer
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.set_lecturer_course_assignments(p_lecturer_id, p_course_ids);
$function$;

revoke all on function public.set_lecturer_course_assignments(uuid, uuid[])
  from public, anon;
grant execute on function public.set_lecturer_course_assignments(uuid, uuid[])
  to authenticated;

comment on function public.set_lecturer_course_assignments(uuid, uuid[]) is
  'Administrator-only atomic replacement of a lecturer course assignment list.';

-- Require a lecturer to have an active administrator-granted assignment
-- before that lecturer can create a new attendance session for a course.
create or replace function private.start_attendance_session(
  p_course_id uuid,
  p_class_title text,
  p_class_date date,
  p_start_time time without time zone
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_session_id uuid;
  v_eligible_count integer;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required to start an attendance session'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = v_user_id
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  ) then
    raise exception 'Only active lecturers and administrators can start attendance sessions'
      using errcode = '42501';
  end if;

  if p_course_id is null
     or p_class_title is null
     or char_length(btrim(p_class_title)) not between 2 and 160
     or p_class_date is null
     or p_start_time is null then
    raise exception 'Provide a course, class title, class date and start time'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.courses course
    where course.id = p_course_id
      and course.is_active = true
  ) then
    raise exception 'The selected course is not available'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = v_user_id
      and sp.is_active = true
      and (
        sp.staff_role = 'administrator'
        or (
          sp.staff_role = 'lecturer'
          and exists (
            select 1
            from public.lecturer_course_assignments assignment
            where assignment.lecturer_id = sp.id
              and assignment.course_id = p_course_id
          )
        )
      )
  ) then
    raise exception 'You are not assigned to this course. Contact the CampusFace administrator.'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_eligible_count
  from public.student_courses sc
  join public.students st on st.id = sc.student_id
  where sc.course_id = p_course_id
    and st.is_active = true;

  if v_eligible_count = 0 then
    raise exception 'No active students are currently enrolled in this course. Register or enrol students before starting attendance.'
      using errcode = '22023';
  end if;

  insert into public.attendance_sessions (
    course_id,
    class_title,
    class_date,
    start_time,
    created_by,
    status
  )
  values (
    p_course_id,
    btrim(p_class_title),
    p_class_date,
    p_start_time,
    v_user_id,
    'active'
  )
  returning id into v_session_id;

  insert into public.session_enrolment_snapshots (
    session_id,
    student_id,
    course_id,
    student_full_name,
    registration_number,
    gender,
    faculty,
    department
  )
  select
    v_session_id,
    st.id,
    p_course_id,
    st.full_name,
    st.registration_number,
    st.gender,
    st.faculty,
    st.department
  from public.student_courses sc
  join public.students st on st.id = sc.student_id
  where sc.course_id = p_course_id
    and st.is_active = true
  order by lower(st.full_name), lower(st.registration_number);

  get diagnostics v_eligible_count = row_count;

  if v_eligible_count = 0 then
    raise exception 'The enrolment snapshot could not be created'
      using errcode = 'P0001';
  end if;

  return v_session_id;
end;
$function$;

revoke all on function private.start_attendance_session(uuid, text, date, time without time zone)
  from public, anon, authenticated;
grant execute on function private.start_attendance_session(uuid, text, date, time without time zone)
  to authenticated;

commit;