create or replace function public.update_student_record_with_academic_structure(
  p_student_id uuid,
  p_full_name text,
  p_registration_number text,
  p_gender text,
  p_faculty_id uuid,
  p_department_id uuid,
  p_course_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_faculty_name text;
  v_department_name text;
  v_unique_course_count integer;
  v_existing_assignment boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to update a student'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  ) then
    raise exception 'Only active authorised staff can update student records'
      using errcode = '42501';
  end if;

  if p_student_id is null or not exists (
    select 1 from public.students s where s.id = p_student_id
  ) then
    raise exception 'The selected student record does not exist'
      using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.faculty_id = p_faculty_id
      and s.department_id = p_department_id
  ) into v_existing_assignment;

  select f.name, d.name
  into v_faculty_name, v_department_name
  from public.faculties f
  join public.departments d on d.faculty_id = f.id
  where f.id = p_faculty_id
    and d.id = p_department_id
    and (
      (f.is_active = true and d.is_active = true)
      or v_existing_assignment = true
    );

  if v_faculty_name is null or v_department_name is null then
    raise exception 'Select an active department belonging to the selected active faculty'
      using errcode = '22023';
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

  update public.students
  set full_name = btrim(p_full_name),
      registration_number = btrim(p_registration_number),
      gender = p_gender,
      faculty = v_faculty_name,
      department = v_department_name,
      faculty_id = p_faculty_id,
      department_id = p_department_id
  where id = p_student_id;

  delete from public.student_courses
  where student_id = p_student_id;

  insert into public.student_courses (student_id, course_id, enrolled_by)
  select p_student_id, requested.course_id, auth.uid()
  from unnest(p_course_ids) as requested(course_id);
end;
$function$;
