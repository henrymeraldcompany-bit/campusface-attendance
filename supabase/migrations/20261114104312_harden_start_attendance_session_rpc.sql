
begin;

-- Keep privileged implementation code outside the exposed public API schema.
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- Remove default function execution from the private schema. The trigger
-- functions continue to run through their attached triggers; only explicit
-- direct execution is restricted.
revoke execute on all functions in schema private from public, anon, authenticated;

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

-- The public RPC is invoker-only. Its implementation runs in the
-- non-exposed private schema, where the helper validates the signed-in user.
create or replace function public.start_attendance_session(
  p_course_id uuid,
  p_class_title text,
  p_class_date date,
  p_start_time time without time zone
)
returns uuid
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.start_attendance_session(
    p_course_id,
    p_class_title,
    p_class_date,
    p_start_time
  );
$function$;

revoke all on function public.start_attendance_session(uuid, text, date, time without time zone)
  from public, anon;
grant execute on function public.start_attendance_session(uuid, text, date, time without time zone)
  to authenticated;

comment on function public.start_attendance_session(uuid, text, date, time without time zone) is
  'Authenticated invoker-only API wrapper. The permission-checked session and snapshot creation implementation is held in the non-exposed private schema.';

commit;
