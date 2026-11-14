begin;

create table public.biometric_processing_gate (
  id smallint primary key check (id = 1),
  capture_enabled boolean not null default false,
  institutional_approval_reference text,
  dpia_reference text,
  lawful_basis_reference text,
  consent_process_reference text,
  retention_policy_reference text,
  security_review_reference text,
  alternative_process_reference text,
  approved_at timestamptz,
  approved_by uuid references public.staff_profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint biometric_gate_complete_before_enable check (
    capture_enabled = false
    or (
      nullif(btrim(institutional_approval_reference), '') is not null
      and nullif(btrim(dpia_reference), '') is not null
      and nullif(btrim(lawful_basis_reference), '') is not null
      and nullif(btrim(consent_process_reference), '') is not null
      and nullif(btrim(retention_policy_reference), '') is not null
      and nullif(btrim(security_review_reference), '') is not null
      and nullif(btrim(alternative_process_reference), '') is not null
      and approved_at is not null
      and approved_by is not null
    )
  )
);

comment on table public.biometric_processing_gate is
  'Server-controlled gate for any future biometric face registration. Client sessions can read the gate but cannot enable or configure biometric processing.';
comment on column public.biometric_processing_gate.capture_enabled is
  'Remains false until all governance and privacy prerequisites are verified and set through a trusted server-side process.';

insert into public.biometric_processing_gate (id, capture_enabled)
values (1, false)
on conflict (id) do nothing;

alter table public.biometric_processing_gate enable row level security;
revoke all on table public.biometric_processing_gate from public, anon, authenticated;
grant select on table public.biometric_processing_gate to authenticated;
grant all on table public.biometric_processing_gate to service_role;

create policy "Active staff can read biometric processing readiness"
on public.biometric_processing_gate
for select
to authenticated
using (
  id = 1
  and exists (
    select 1 from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
  )
);

commit;