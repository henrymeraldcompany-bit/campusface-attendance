begin;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  student_id uuid not null,
  marked_at timestamptz not null default now(),
  marked_by uuid not null references public.staff_profiles (id) on delete restrict,
  verification_method text not null default 'manual'
    check (verification_method in ('manual')),
  created_at timestamptz not null default now(),
  constraint attendance_records_session_student_unique
    unique (session_id, student_id),
  constraint attendance_records_snapshot_student_fk
    foreign key (session_id, student_id)
    references public.session_enrolment_snapshots (session_id, student_id)
    on delete restrict
);

comment on table public.attendance_records is
  'Present attendance marks. A record may only exist for a student in the session fixed enrolment snapshot. Unique session/student pairs prevent duplicate attendance. At this stage, marks are manually verified by authorised staff; face recognition is not available.';
comment on column public.attendance_records.verification_method is
  'Only manual verification is enabled. Biometric verification must not be added until the biometric processing gate and institutional safeguards are approved.';

create index attendance_records_session_marked_idx
  on public.attendance_records (session_id, marked_at desc);
create index attendance_records_student_marked_idx
  on public.attendance_records (student_id, marked_at desc);

alter table public.attendance_records enable row level security;

revoke all on table public.attendance_records from public, anon, authenticated;
grant select on table public.attendance_records to authenticated;
grant all on table public.attendance_records to service_role;

create policy "Staff can read attendance records for accessible sessions"
on public.attendance_records
for select
to authenticated
using (
  exists (
    select 1
    from public.attendance_sessions s
    join public.staff_profiles sp on sp.id = (select auth.uid())
    where s.id = public.attendance_records.session_id
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
      and (s.created_by = sp.id or sp.staff_role = 'administrator')
  )
);

create or replace function public.mark_student_present(
  p_session_id uuid,
  p_student_id uuid
)
returns text
language plpgsql
security definer
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
    raise exception 'The attendance session does not exist'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.staff_profiles sp
    where sp.id = v_user_id
      and (v_session.created_by = sp.id or sp.staff_role = 'administrator')
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