begin;

-- Keep historical manual records readable, but prevent any new manual
-- attendance insertions or changes to the verification method.
drop policy if exists "Active staff can mark only snapshot students in accessible active sessions"
  on public.attendance_records;

revoke insert on table public.attendance_records from public, anon, authenticated;
revoke insert (session_id, student_id, marked_by, verification_method)
  on table public.attendance_records from public, anon, authenticated;

create or replace function public.enforce_face_confirmed_attendance()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'INSERT' and new.verification_method <> 'face_confirmed' then
    raise exception 'A successful face scan of this student and lecturer confirmation are required before attendance can be recorded.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and new.verification_method is distinct from old.verification_method
    and new.verification_method <> 'face_confirmed' then
    raise exception 'Attendance verification cannot be changed to manual. A confirmed face scan is required.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_face_confirmed_attendance()
  from public, anon, authenticated;

drop trigger if exists attendance_records_require_face_confirmed_insert
  on public.attendance_records;
create trigger attendance_records_require_face_confirmed_insert
before insert on public.attendance_records
for each row
execute function public.enforce_face_confirmed_attendance();

drop trigger if exists attendance_records_require_face_confirmed_update
  on public.attendance_records;
create trigger attendance_records_require_face_confirmed_update
before update of verification_method on public.attendance_records
for each row
execute function public.enforce_face_confirmed_attendance();

-- Retire the old manual RPC without deleting it, so any older installed
-- CampusFace client receives a clear rejection instead of recording a mark.
create or replace function public.mark_student_present(
  p_session_id uuid,
  p_student_id uuid
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception 'A successful face scan of this student and lecturer confirmation are required before attendance can be recorded.'
    using errcode = '42501';
end;
$function$;

revoke all on function public.mark_student_present(uuid, uuid)
  from public, anon;
grant execute on function public.mark_student_present(uuid, uuid)
  to authenticated;

comment on function public.mark_student_present(uuid, uuid) is
  'Retired manual-marking RPC. Always rejects. New attendance records are created only by the trusted confirm_face_attendance flow after a short-lived face-match ticket is confirmed by the same authorised lecturer.';

comment on column public.attendance_records.verification_method is
  'New attendance records must be face_confirmed and are inserted only by the trusted face-ticket confirmation path. Existing manual records are retained unchanged for historical reporting; no new manual marks are allowed.';

commit;
