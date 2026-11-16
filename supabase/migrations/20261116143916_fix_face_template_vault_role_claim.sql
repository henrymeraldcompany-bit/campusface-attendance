begin;

create or replace function public.get_face_template_encryption_key()
returns text
language plpgsql
security definer
set search_path = pg_catalog, vault
as $function$
declare
  v_role text;
  v_claims text;
  v_secret text;
begin
  -- Supabase/PostgREST exposes JWT claims as a JSON object. Older
  -- deployments may also populate the individual role setting.
  v_claims := current_setting('request.jwt.claims', true);

  if nullif(v_claims, '') is not null then
    begin
      v_role := (v_claims::jsonb ->> 'role');
    exception when others then
      v_role := null;
    end;
  end if;

  if v_role is null then
    v_role := nullif(current_setting('request.jwt.claim.role', true), '');
  end if;

  -- EXECUTE is also revoked from PUBLIC, anon and authenticated.
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

  if v_secret is null then
    raise exception 'The face-template encryption secret is missing from Vault'
      using errcode = 'P0002';
  end if;

  return v_secret;
end;
$function$;

revoke all on function public.get_face_template_encryption_key()
  from public, anon, authenticated;
grant execute on function public.get_face_template_encryption_key()
  to service_role;

comment on function public.get_face_template_encryption_key() is
  'Service-role-only retrieval of the AES-256-GCM face template key from Supabase Vault. Accepts the current JSON JWT claims setting and the legacy individual role claim setting.';

commit;
