begin;

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  class_title text not null
    check (char_length(btrim(class_title)) between 2 and 160),
  class_date date not null,
  start_time time without time zone not null,
  started_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
    references public.staff_profiles (id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'ended')),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_sessions_status_end_time_check check (
    (status = 'active' and ended_at is null)
    or (status = 'ended' and ended_at is not null)
  )
);

comment on table public.attendance_sessions is
  'Class attendance sessions. A session stores the course, class title, scheduled date and start time, actual creation time, creator and lifecycle status.';
comment on column public.attendance_sessions.started_at is
  'Server timestamp when the lecturer starts the attendance session.';
comment on column public.attendance_sessions.status is
  'Session lifecycle. End-class processing and reports are implemented in a later task.';

create index attendance_sessions_course_date_idx
  on public.attendance_sessions (course_id, class_date desc);
create index attendance_sessions_created_by_started_idx
  on public.attendance_sessions (created_by, started_at desc);
create index attendance_sessions_status_idx
  on public.attendance_sessions (status, started_at desc);

create table public.session_enrolment_snapshots (
  session_id uuid not null references public.attendance_sessions (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  student_full_name text not null,
  registration_number text not null,
  gender text not null check (gender in ('female', 'male')),
  faculty text not null,
  department text not null,
  snapshotted_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

comment on table public.session_enrolment_snapshots is
  'Immutable-at-application-level snapshot of students actively enrolled in the session course at session start. Snapshot values preserve the session denominator and identity details if student records or enrolments later change.';
create index session_enrolment_snapshots_student_idx
  on public.session_enrolment_snapshots (student_id);
create index session_enrolment_snapshots_course_idx
  on public.session_enrolment_snapshots (course_id);

alter table public.attendance_sessions enable row level security;
alter table public.session_enrolment_snapshots enable row level security;

revoke all on table public.attendance_sessions from public, anon, authenticated;
revoke all on table public.session_enrolment_snapshots from public, anon, authenticated;
grant select on table public.attendance_sessions to authenticated;
grant select on table public.session_enrolment_snapshots to authenticated;
grant all on table public.attendance_sessions to service_role;
grant all on table public.session_enrolment_snapshots to service_role;

create policy "Staff can read sessions they created or administer"
on public.attendance_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
      and (
        public.attendance_sessions.created_by = sp.id
        or sp.staff_role = 'administrator'
      )
  )
);

create policy "Staff can read snapshots for accessible sessions"
on public.session_enrolment_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.attendance_sessions s
    join public.staff_profiles sp on sp.id = (select auth.uid())
    where s.id = public.session_enrolment_snapshots.session_id
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
      and (
        s.created_by = sp.id
        or sp.staff_role = 'administrator'
      )
  )
);

create or replace function public.start_attendance_session(
  p_course_id uuid,
  p_class_title text,
  p_class_date date,
  p_start_time time without time zone
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_session_id uuid;
  v_eligible_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to start an attendance session'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
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
    select 1 from public.courses c
    where c.id = p_course_id and c.is_active = true
  ) then
    raise exception 'The selected course is not available'
      using errcode = '22023';
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
    auth.uid(),
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

revoke all on function public.start_attendance_session(uuid, text, date, time without time zone)
  from public, anon;
grant execute on function public.start_attendance_session(uuid, text, date, time without time zone)
  to authenticated;

commit;