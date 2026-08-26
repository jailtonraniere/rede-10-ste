-- Transforma a coleta publica em autocadastro e registra os consentimentos
-- declarados pela propria pessoa, com versao e origem auditaveis.
-- A assinatura anterior com oito argumentos permanece disponível durante a
-- implantação para que clientes ainda não atualizados continuem funcionando.

create or replace function public.submit_collection_member(
  p_token text,
  p_nome text,
  p_telefone text,
  p_email text,
  p_municipio text,
  p_bairro text,
  p_observacao text,
  p_treatment_authorized boolean,
  p_contact_authorized boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.collection_links;
  v_phone text;
  v_id uuid;
  v_consent_version constant text := 'autocadastro-v1';
begin
  if length(coalesce(p_token, '')) < 24 then raise exception 'Link invalido'; end if;
  if p_treatment_authorized is not true then raise exception 'Consentimento obrigatorio'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 160 then raise exception 'Nome invalido'; end if;
  if length(trim(coalesce(p_municipio, ''))) < 2 or length(trim(coalesce(p_bairro, ''))) < 2 then
    raise exception 'Localizacao invalida';
  end if;

  select * into v_link
  from public.collection_links
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and active
    and expires_at > now()
  limit 1;
  if v_link.id is null then raise exception 'Link invalido ou expirado'; end if;

  v_phone := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g');
  if length(v_phone) not between 10 and 15 then raise exception 'Telefone invalido'; end if;
  if exists (
    select 1 from public.network_members
    where telefone_normalizado = v_phone and status <> 'desligado'
  ) then
    raise exception 'Cadastro ja existente';
  end if;

  insert into public.network_members(
    nome, telefone_normalizado, email, municipio, bairro, parent_member_id,
    status, participation_type, member_role, registration_status, link_status,
    data_source, contact_authorized, internal_notes
  ) values (
    trim(p_nome), v_phone, nullif(trim(p_email), ''), trim(p_municipio),
    trim(p_bairro), v_link.leader_member_id, 'cadastrado', 'participante',
    'participante', 'pendente_revisao', 'informado_lideranca',
    'Autocadastro por link', coalesce(p_contact_authorized, false),
    nullif(trim(p_observacao), '')
  ) returning id into v_id;

  insert into public.consent_records(
    member_id, consent_type, consent_version, accepted, source
  ) values
    (v_id, 'tratamento', v_consent_version, true, 'autocadastro_link'),
    (v_id, 'comunicacoes', v_consent_version, coalesce(p_contact_authorized, false), 'autocadastro_link');

  insert into public.audit_logs(action, entity_type, entity_id, new_data_resumida)
  values (
    'public_self_registration_submitted', 'network_member', v_id::text,
    jsonb_build_object(
      'source', 'self_registration_link',
      'leader_member_id', v_link.leader_member_id,
      'consent_version', v_consent_version,
      'contact_authorized', coalesce(p_contact_authorized, false)
    )
  );

  return v_id;
end;
$$;

revoke all on function public.submit_collection_member(
  text,text,text,text,text,text,text,boolean,boolean
) from public;
grant execute on function public.submit_collection_member(
  text,text,text,text,text,text,text,boolean,boolean
) to anon, authenticated;
