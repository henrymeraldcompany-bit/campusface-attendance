begin;

-- A session can be ended only by its creator or an active administrator.
-- The only client-writable field is status; the trigger supplies ended_at.
revoke update on table public.attendance_sessions from anon, authenticated;
grant update (status) on table public.attendance_sessions to authenticated;

drop policy if exists "Staff can end sessions they created or administer"
  on public.attendance_sessions;

create policy "Staff can end sessions they created or administer"
on public.attendance_sessions
for update
to authenticated
using (
  status = 'active'
  and exists (
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
)
with check (
  status = 'ended'
  and ended_at is not null
  and exists (
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

create or replace function public.guard_attendance_session_ending()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if old.status = 'ended' then
    if new is distinct from old then
      raise exception 'An ended attendance session is permanently read-only'
        using errcode = '22023';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'active' or new.status <> 'ended' then
      raise exception 'Attendance sessions may only transition from active to ended'
        using errcode = '22023';
    end if;

    new.ended_at := pg_catalog.clock_timestamp();
  elsif new.ended_at is distinct from old.ended_at then
    raise exception 'The session end time is assigned by the database'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_attendance_session_ending
  on public.attendance_sessions;

create trigger guard_attendance_session_ending
before update on public.attendance_sessions
for each row
execute function public.guard_attendance_session_ending();

revoke all on function public.guard_attendance_session_ending()
  from public, anon, authenticated;

create or replace function public.end_attendance_session(
  p_session_id uuid
)
returns timestamptz
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.attendance_sessions%rowtype;
  v_ended_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to end an attendance session'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = v_user_id
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  ) then
    raise exception 'Only active lecturers and administrators can end attendance sessions'
      using errcode = '42501';
  end if;

  select s.*
  into v_session
  from public.attendance_sessions s
  where s.id = p_session_id;

  if not found then
    raise exception 'The attendance session does not exist or is not accessible'
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
    raise exception 'You do not have permission to end this attendance session'
      using errcode = '42501';
  end if;

  if v_session.status = 'ended' then
    return v_session.ended_at;
  end if;

  update public.attendance_sessions
  set status = 'ended'
  where id = p_session_id
    and status = 'active'
  returning ended_at into v_ended_at;

  if v_ended_at is null then
    select s.ended_at
    into v_ended_at
    from public.attendance_sessions s
    where s.id = p_session_id;
  end if;

  if v_ended_at is null then
    raise exception 'The attendance session could not be ended'
      using errcode = 'P0001';
  end if;

  return v_ended_at;
end;
$function$;

revoke all on function public.end_attendance_session(uuid)
  from public, anon;
grant execute on function public.end_attendance_session(uuid)
  to authenticated;

comment on function public.end_attendance_session(uuid) is
  'Ends an active session for its creator or an active administrator. The database assigns ended_at; ended sessions cannot be reopened or edited. Attendance marks are frozen because marking requires an active session.';

commit;
