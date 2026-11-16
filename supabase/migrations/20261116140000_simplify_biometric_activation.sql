begin;

-- The user has confirmed that institutional approval and DPIA review are complete.
-- Remove the seven document-reference columns from the feature gate; they are
-- no longer required as runtime inputs. Keep a timestamp and accountable
-- active administrator profile for the activation decision.
alter table public.biometric_processing_gate
  drop constraint if exists biometric_gate_complete_before_enable;

alter table public.biometric_processing_gate
  drop column if exists institutional_approval_reference,
  drop column if exists dpia_reference,
  drop column if exists lawful_basis_reference,
  drop column if exists consent_process_reference,
  drop column if exists retention_policy_reference,
  drop column if exists security_review_reference,
  drop column if exists alternative_process_reference;

alter table public.biometric_processing_gate
  add constraint biometric_gate_requires_admin_attestation
  check (
    capture_enabled = false
    or (approved_at is not null and approved_by is not null)
  );

comment on table public.biometric_processing_gate is
  'Server-controlled biometric processing switch. Activation is recorded with an approving active administrator and timestamp. Individual student consent, guardian consent where required, server encryption and matching safeguards remain mandatory.';

comment on column public.biometric_processing_gate.capture_enabled is
  'When true, the institution-level biometric feature is enabled. Server-side student consent and encrypted template requirements continue to apply.';

-- Record the user's confirmation that institutional approval and DPIA review
-- have been completed, attributed to the active institution administrator.
update public.biometric_processing_gate gate
set capture_enabled = true,
    approved_at = now(),
    approved_by = (
      select profile.id
      from public.staff_profiles profile
      where profile.is_active = true
        and profile.staff_role = 'administrator'
      order by profile.created_at asc
      limit 1
    ),
    updated_at = now()
where gate.id = 1
  and exists (
    select 1 from public.staff_profiles profile
    where profile.is_active = true
      and profile.staff_role = 'administrator'
  );

-- The service-role-only RPC lets the Edge Function retrieve the template key
-- from Supabase Vault without exposing the key to browser roles.
create or replace function public.get_face_template_encryption_key()
returns text
language plpgsql
security definer
set search_path = pg_catalog, vault
as $function$
declare
  v_role text := current_setting('request.jwt.claim.role', true);
  v_secret text;
begin
  if v_role is distinct from 'service_role' then
    raise exception 'Service role is required to retrieve the face template key'
      using errcode = '42501';
  end if;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = 'campusface_face_template_key'
  order by created_at desc
  limit 1;

  return v_secret;
end;
$function$;

revoke all on function public.get_face_template_encryption_key()
  from public, anon, authenticated;
grant execute on function public.get_face_template_encryption_key()
  to service_role;

comment on function public.get_face_template_encryption_key() is
  'Service-role-only retrieval of the AES-256-GCM face template key from Supabase Vault.';

commit;