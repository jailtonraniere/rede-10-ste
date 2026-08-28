-- Cria um link geral de autocadastro e separa a indicação declarada pela
-- pessoa do vínculo efetivamente validado pela coordenação.

alter table public.network_members
  add column if not exists indicated_by_member_id uuid
    references public.network_members(id) on delete set null;

create index if not exists network_members_indicated_by_idx
  on public.network_members(indicated_by_member_id)
  where indicated_by_member_id is not null;

comment on column public.network_members.indicated_by_member_id is
  'Liderança informada no autocadastro; não altera a árvore até a validação administrativa.';

alter table public.collection_links
  alter column leader_member_id drop not null;

alter table public.collection_links
  add column if not exists link_kind text not null default 'leadership';

update public.collection_links
set link_kind = 'leadership'
where link_kind is null;

alter table public.collection_links
  drop constraint if exists collection_links_kind_leader_check;
alter table public.collection_links
  add constraint collection_links_kind_leader_check check (
    (link_kind = 'leadership' and leader_member_id is not null)
    or (link_kind = 'general' and leader_member_id is null)
  );

create unique index if not exists collection_links_one_active_general_idx
  on public.collection_links(link_kind)
  where link_kind = 'general' and active;

comment on column public.collection_links.link_kind is
  'leadership para link pessoal; general para link externo com escolha opcional da liderança.';

create or replace function public.rotate_external_registration_link(
  p_token_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link_id uuid;
  v_profile_id uuid := private.current_profile_id();
begin
  if v_profile_id is null or private.current_role() is distinct from 'administrador' then
    raise exception 'Apenas administradores podem gerar o link geral';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token invalido';
  end if;

  update public.collection_links
  set active = false,
      revoked_at = now()
  where link_kind = 'general'
    and active;

  insert into public.collection_links(
    leader_member_id, token_hash, active, expires_at, created_by, link_kind
  ) values (
    null, p_token_hash, true, now() + interval '30 days', v_profile_id, 'general'
  )
  returning id into v_link_id;

  return v_link_id;
end;
$$;

revoke all on function public.rotate_external_registration_link(text)
  from public, anon, authenticated;
grant execute on function public.rotate_external_registration_link(text)
  to authenticated;

create or replace function public.get_external_registration_context(p_token text)
returns table(
  link_kind text,
  default_leader_id uuid,
  default_leader_name text,
  expires_at timestamptz,
  allows_leader_choice boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.link_kind,
    n.id,
    n.nome,
    l.expires_at,
    l.link_kind = 'general'
  from public.collection_links l
  left join public.network_members n on n.id = l.leader_member_id
  where length(coalesce(p_token, '')) between 24 and 256
    and l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and l.active
    and l.expires_at > now()
    and (l.link_kind = 'general' or n.id is not null)
  limit 1
$$;

revoke all on function public.get_external_registration_context(text)
  from public, anon, authenticated;
grant execute on function public.get_external_registration_context(text)
  to anon, authenticated;

create or replace function public.search_public_referral_leaders(
  p_token text,
  p_query text
)
returns table(
  leader_id uuid,
  leader_name text,
  municipality text,
  leader_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_query, ''))) not between 2 and 80 then
    return;
  end if;
  if not exists (
    select 1
    from public.collection_links l
    where length(coalesce(p_token, '')) between 24 and 256
      and l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
      and l.active
      and l.expires_at > now()
      and l.link_kind = 'general'
  ) then
    return;
  end if;

  return query
  select n.id, n.nome, n.municipio, n.member_role::text
  from public.network_members n
  where n.member_role in ('lideranca', 'mobilizador')
    and n.status not in ('inativo', 'desligado', 'bloqueado')
    and n.registration_status not in ('inativo', 'duplicado', 'desligado')
    and strpos(lower(n.nome), lower(trim(p_query))) > 0
  order by n.nome
  limit 20;
end;
$$;

revoke all on function public.search_public_referral_leaders(text,text)
  from public, anon, authenticated;
grant execute on function public.search_public_referral_leaders(text,text)
  to anon, authenticated;

create or replace function public.submit_collection_member(
  p_token text,
  p_nome text,
  p_telefone text,
  p_email text,
  p_municipio text,
  p_bairro text,
  p_observacao text,
  p_treatment_authorized boolean,
  p_contact_authorized boolean,
  p_indicated_by_member_id uuid
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
  v_indicated_by_member_id uuid;
  v_consent_version constant text := 'autocadastro-v2';
begin
  if length(coalesce(p_token, '')) not between 24 and 256 then raise exception 'Link invalido'; end if;
  if p_treatment_authorized is not true then raise exception 'Consentimento obrigatorio'; end if;
  if length(trim(coalesce(p_nome, ''))) not between 2 and 160 then raise exception 'Nome invalido'; end if;
  if length(trim(coalesce(p_municipio, ''))) not between 2 and 160
     or length(trim(coalesce(p_bairro, ''))) not between 2 and 160 then
    raise exception 'Localizacao invalida';
  end if;
  if nullif(trim(coalesce(p_email, '')), '') is not null
     and (length(trim(p_email)) > 254 or trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Email invalido';
  end if;
  if length(coalesce(p_observacao, '')) > 2000 then raise exception 'Observacao muito longa'; end if;

  select * into v_link
  from public.collection_links
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and active
    and expires_at > now()
  limit 1;
  if v_link.id is null then raise exception 'Link invalido ou expirado'; end if;

  if v_link.link_kind = 'leadership' then
    v_indicated_by_member_id := v_link.leader_member_id;
  else
    v_indicated_by_member_id := p_indicated_by_member_id;
  end if;

  if v_indicated_by_member_id is not null and not exists (
    select 1
    from public.network_members n
    where n.id = v_indicated_by_member_id
      and n.member_role in ('lideranca', 'mobilizador')
      and n.status not in ('inativo', 'desligado', 'bloqueado')
      and n.registration_status not in ('inativo', 'duplicado', 'desligado')
  ) then
    raise exception 'Lideranca indicada indisponivel';
  end if;

  v_phone := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g');
  if length(v_phone) not in (10, 11) then raise exception 'Telefone invalido'; end if;
  if exists (
    select 1 from public.network_members
    where telefone_normalizado = v_phone and status <> 'desligado'
  ) then
    raise exception 'Cadastro ja existente';
  end if;

  insert into public.network_members(
    nome, telefone_normalizado, email, municipio, bairro,
    parent_member_id, indicated_by_member_id,
    status, participation_type, member_role, is_team_member,
    registration_status, link_status, data_source, record_origin,
    contact_authorized, internal_notes
  ) values (
    trim(p_nome), v_phone, nullif(trim(p_email), ''), trim(p_municipio),
    trim(p_bairro), null, v_indicated_by_member_id,
    'cadastrado', 'participante', 'participante', false,
    'pendente_revisao',
    case when v_indicated_by_member_id is null then 'nao_informado' else 'em_validacao' end,
    'Autocadastro por link externo', 'autocadastro',
    coalesce(p_contact_authorized, false), nullif(trim(p_observacao), '')
  ) returning id into v_id;

  insert into public.consent_records(
    member_id, consent_type, consent_version, accepted, source
  ) values
    (v_id, 'tratamento', v_consent_version, true, 'autocadastro_link_externo'),
    (v_id, 'comunicacoes', v_consent_version, coalesce(p_contact_authorized, false), 'autocadastro_link_externo');

  insert into public.audit_logs(action, entity_type, entity_id, new_data_resumida)
  values (
    'public_self_registration_submitted', 'network_member', v_id::text,
    jsonb_build_object(
      'source', 'external_self_registration_link',
      'link_kind', v_link.link_kind,
      'indicated_by_member_id', v_indicated_by_member_id,
      'consent_version', v_consent_version,
      'contact_authorized', coalesce(p_contact_authorized, false)
    )
  );

  return v_id;
end;
$$;

revoke all on function public.submit_collection_member(
  text,text,text,text,text,text,text,boolean,boolean,uuid
) from public, anon, authenticated;
grant execute on function public.submit_collection_member(
  text,text,text,text,text,text,text,boolean,boolean,uuid
) to anon, authenticated;

-- Compatibilidade com o cliente imediatamente anterior. Links pessoais ainda
-- funcionam; links gerais sem a nova seleção entram como "sem indicação".
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
language sql
security invoker
set search_path = ''
as $$
  select public.submit_collection_member(
    p_token, p_nome, p_telefone, p_email, p_municipio, p_bairro,
    p_observacao, p_treatment_authorized, p_contact_authorized, null::uuid
  )
$$;

revoke all on function public.submit_collection_member(
  text,text,text,text,text,text,text,boolean,boolean
) from public, anon, authenticated;
grant execute on function public.submit_collection_member(
  text,text,text,text,text,text,text,boolean,boolean
) to anon, authenticated;

-- A assinatura antiga sem consentimento obrigatório deixa de ser uma API pública.
revoke all on function public.submit_collection_member(
  text,text,text,text,text,text,text,boolean
) from public, anon, authenticated;
