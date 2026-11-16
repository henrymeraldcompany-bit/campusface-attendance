begin;
comment on table public.attendance_records is
  'Present attendance marks for students in the fixed session enrolment snapshot. Verification is either manual identity verification or a face candidate that was confirmed in person by the authorised lecturer using a short-lived confirmation ticket.';
comment on column public.attendance_records.verification_method is
  'manual means staff identity check; face_confirmed means an on-device similarity candidate was reviewed and confirmed by the authorised lecturer. Recognition alone never writes attendance.';
commit;