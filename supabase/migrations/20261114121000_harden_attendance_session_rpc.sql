alter function public.start_attendance_session(uuid, text, date, time without time zone)
  set search_path = pg_catalog;

comment on function public.start_attendance_session(uuid, text, date, time without time zone) is
  'Trusted SECURITY DEFINER RPC. Executes atomically after checking auth.uid() against an active staff profile, starts the session and snapshots only active students enrolled in the selected active course. Direct table writes remain unavailable to browser clients.';
