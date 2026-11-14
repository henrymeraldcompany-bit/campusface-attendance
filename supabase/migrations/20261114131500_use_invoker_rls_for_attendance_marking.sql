begin;

grant insert (session_id, student_id, marked_by, verification_method)
  on table public.attendance_records to authenticated;

create policy "Active staff can mark only snapshot students in accessible active sessions"
on public.attendance_records
for insert
to authenticated
with check (
  marked_by = (select auth.uid())
  and verification_method = 'manual'
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
  and exists (
    select 1
    from public.attendance_sessions s
    where s.id = public.attendance_records.session_id
      and s.status = 'active'
      and (
        s.created_by = (select auth.uid())
        or exists (
          select 1
          from public.staff_profiles admin_profile
          where admin_profile.id = (select auth.uid())
            and admin_profile.is_active = true
            and admin_profile.staff_role = 'administrator'
        )
      )
  )
  and exists (
    select 1
    from public.session_enrolment_snapshots snap
    where snap.session_id = public.attendance_records.session_id
      and snap.student_id = public.attendance_records.student_id
  )
);

create or replace function public.mark_student_present(
  p_session_id uuid,
  p_student_id uuid
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.attendance_sessions%rowtype;
  v_inserted_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to mark attendance'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = v_user_id
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  ) then
    raise exception 'Only active lecturers and administrators can mark attendance'
      using errcode = '42501';
  end if;

  select s.*
  into v_session
  from public.attendance_sessions s
  where s.id = p_session_id;

  if not found then
    raise exception 'The attendance session does not exist or is not accessible to this staff account'
      using errcode = 'P0002';
  end if;

  if not (
    v_session.created_by = v_user_id
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.id = v_user_id
        and sp.is_active = true
        and sp.staff_role = 'administrator'
    )
  ) then
    raise exception 'You do not have access to this attendance session'
      using errcode = '42501';
  end if;

  if v_session.status <> 'active' then
    raise exception 'This attendance session has ended and can no longer accept attendance marks'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.session_enrolment_snapshots snap
    where snap.session_id = p_session_id
      and snap.student_id = p_student_id
  ) then
    raise exception 'This student is not in the saved enrolment snapshot for this session'
      using errcode = '22023';
  end if;

  insert into public.attendance_records (
    session_id,
    student_id,
    marked_by,
    verification_method
  )
  values (
    p_session_id,
    p_student_id,
    v_user_id,
    'manual'
  )
  on conflict (session_id, student_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count = 0 then
    return 'already_recorded';
  end if;

  return 'recorded';
end;
$function$;

revoke all on function public.mark_student_present(uuid, uuid)
  from public, anon;
grant execute on function public.mark_student_present(uuid, uuid)
  to authenticated;

commit;