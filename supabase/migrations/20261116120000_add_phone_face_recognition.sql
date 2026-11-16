begin;

create table public.biometric_student_consents (
  student_id uuid primary key references public.students(id) on delete cascade,
  consent_status text not null default 'granted'
    check (consent_status in ('granted', 'withdrawn')),
  student_is_minor boolean not null,
  consent_authority text not null
    check (consent_authority in ('student', 'parent_guardian')),
  consent_reference text not null
    check (char_length(btrim(consent_reference)) between 3 and 240),
  consent_document_version text not null
    check (char_length(btrim(consent_document_version)) between 1 and 80),
  recorded_by uuid not null references public.staff_profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint biometric_consent_authority_matches_age check (
    (student_is_minor = true and consent_authority = 'parent_guardian')
    or
    (student_is_minor = false and consent_authority = 'student')
  ),
  constraint biometric_consent_withdrawal_state check (
    (consent_status = 'granted' and withdrawn_at is null)
    or (consent_status = 'withdrawn' and withdrawn_at is not null)
  )
);

comment on table public.biometric_student_consents is
  'Minimal consent evidence references only. No signature, identity document or face image is stored here. Minor students require a parent/guardian consent record.';

create table public.face_templates (
  student_id uuid primary key references public.students(id) on delete cascade,
  encrypted_embedding text not null,
  iv_base64 text not null,
  key_version smallint not null default 1,
  model_id text not null,
  enrolled_by uuid not null references public.staff_profiles(id) on delete restrict,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  constraint face_template_model_id_check check (model_id = 'opencv-sface-2021dec')
);

comment on table public.face_templates is
  'Encrypted 128-value biometric templates only. Camera frames and source photographs are never stored. Browser roles have no access; the trusted face-biometric Edge Function uses the service role.';

create table public.face_match_tickets (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.staff_profiles(id) on delete cascade,
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index face_match_tickets_expiry_idx
  on public.face_match_tickets (expires_at)
  where consumed_at is null;

create table public.face_processing_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.staff_profiles(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  session_id uuid references public.attendance_sessions(id) on delete set null,
  event_type text not null
    check (event_type in ('consent_recorded', 'template_enrolled', 'template_withdrawn', 'match_candidate', 'attendance_confirmed', 'gate_updated')),
  created_at timestamptz not null default now()
);

comment on table public.face_processing_audit is
  'Minimal audit events for biometric workflow. Do not place face images, embeddings, raw matching inputs, or unnecessary student details in this log.';

alter table public.biometric_student_consents enable row level security;
alter table public.face_templates enable row level security;
alter table public.face_match_tickets enable row level security;
alter table public.face_processing_audit enable row level security;

revoke all on table public.biometric_student_consents from public, anon, authenticated;
revoke all on table public.face_templates from public, anon, authenticated;
revoke all on table public.face_match_tickets from public, anon, authenticated;
revoke all on table public.face_processing_audit from public, anon, authenticated;

grant all on table public.biometric_student_consents to service_role;
grant all on table public.face_templates to service_role;
grant all on table public.face_match_tickets to service_role;
grant all on table public.face_processing_audit to service_role;

alter table public.attendance_records
  drop constraint if exists attendance_records_verification_method_check;

alter table public.attendance_records
  add constraint attendance_records_verification_method_check
  check (verification_method in ('manual', 'face_confirmed'));

comment on column public.attendance_records.verification_method is
  'manual means staff identity check; face_confirmed means an on-device similarity candidate was reviewed and confirmed by the authorised lecturer. Face recognition alone never writes attendance.';

create or replace function public.confirm_face_attendance(
  p_ticket_id uuid,
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_ticket public.face_match_tickets%rowtype;
  v_session public.attendance_sessions%rowtype;
  v_inserted_count integer;
begin
  if p_actor_id is null or p_ticket_id is null then
    raise exception 'A valid confirmation request is required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.staff_profiles sp
    where sp.id = p_actor_id
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  ) then
    raise exception 'The staff account is not authorised to confirm attendance'
      using errcode = '42501';
  end if;

  select ticket.*
  into v_ticket
  from public.face_match_tickets ticket
  where ticket.id = p_ticket_id
  for update;

  if not found then
    raise exception 'The recognition candidate has expired or is unavailable'
      using errcode = 'P0002';
  end if;

  if v_ticket.actor_id <> p_actor_id then
    raise exception 'This recognition candidate belongs to another staff account'
      using errcode = '42501';
  end if;

  if v_ticket.consumed_at is not null or v_ticket.expires_at <= now() then
    raise exception 'The recognition candidate has expired or was already used'
      using errcode = '22023';
  end if;

  select session.*
  into v_session
  from public.attendance_sessions session
  where session.id = v_ticket.session_id;

  if not found or v_session.status <> 'active' then
    raise exception 'This class session is not active'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.staff_profiles actor
    where actor.id = p_actor_id
      and (
        actor.staff_role = 'administrator'
        or v_session.created_by = p_actor_id
      )
  ) then
    raise exception 'You do not have access to this class session'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.biometric_processing_gate gate
    where gate.id = 1 and gate.capture_enabled = true
  ) then
    raise exception 'Biometric processing is currently disabled'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.session_enrolment_snapshots snap
    join public.biometric_student_consents consent
      on consent.student_id = snap.student_id
     and consent.consent_status = 'granted'
     and consent.withdrawn_at is null
    join public.face_templates template
      on template.student_id = snap.student_id
     and template.is_active = true
    where snap.session_id = v_ticket.session_id
      and snap.student_id = v_ticket.student_id
  ) then
    raise exception 'The student is no longer eligible for face recognition'
      using errcode = '22023';
  end if;

  insert into public.attendance_records (
    session_id,
    student_id,
    marked_by,
    verification_method
  )
  values (
    v_ticket.session_id,
    v_ticket.student_id,
    p_actor_id,
    'face_confirmed'
  )
  on conflict (session_id, student_id) do nothing;

  get diagnostics v_inserted_count = row_count;

  update public.face_match_tickets
  set consumed_at = now()
  where id = p_ticket_id;

  insert into public.face_processing_audit (
    actor_id, student_id, session_id, event_type
  )
  values (
    p_actor_id,
    v_ticket.student_id,
    v_ticket.session_id,
    'attendance_confirmed'
  );

  if v_inserted_count = 0 then
    return 'already_recorded';
  end if;

  return 'recorded';
end;
$function$;

revoke all on function public.confirm_face_attendance(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_face_attendance(uuid, uuid)
  to service_role;

commit;