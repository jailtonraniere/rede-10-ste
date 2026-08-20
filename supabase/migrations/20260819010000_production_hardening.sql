-- Endurecimento para uso com dados reais.

-- A aplicação precisa distinguir liderança principal de participante antes da ativação do Auth.
alter table public.network_members
  add column if not exists member_role public.app_role not null default 'participante';

alter table public.network_members
  drop constraint if exists network_members_operational_role_check;
alter table public.network_members
  add constraint network_members_operational_role_check
  check (member_role in ('lideranca','mobilizador','participante'));

update public.network_members
set member_role = case
  when participation_type = 'mobilizador' then 'mobilizador'::public.app_role
  else 'participante'::public.app_role
end
where member_role = 'participante';

-- Corrige o schema do pgcrypto com search_path vazio.
create or replace function public.submit_collection_member(
  p_token text,p_nome text,p_telefone text,p_email text,p_municipio text,
  p_bairro text,p_observacao text,p_contact_authorized boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_link public.collection_links;
  v_phone text;
  v_id uuid;
begin
  if length(coalesce(p_token,'')) < 24 then raise exception 'Link invalido'; end if;
  if length(trim(coalesce(p_nome,''))) not between 2 and 160 then raise exception 'Nome invalido'; end if;
  if length(trim(coalesce(p_municipio,''))) < 2 or length(trim(coalesce(p_bairro,''))) < 2 then raise exception 'Localizacao invalida'; end if;

  select * into v_link
  from public.collection_links
  where token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
    and active and expires_at > now()
  limit 1;
  if v_link.id is null then raise exception 'Link invalido ou expirado'; end if;

  v_phone := regexp_replace(coalesce(p_telefone,''),'[^0-9]','','g');
  if length(v_phone) not between 10 and 15 then raise exception 'Telefone invalido'; end if;
  if exists(select 1 from public.network_members where telefone_normalizado=v_phone and status<>'desligado') then
    raise exception 'Cadastro ja existente';
  end if;

  insert into public.network_members(
    nome,telefone_normalizado,email,municipio,bairro,parent_member_id,status,
    participation_type,member_role,registration_status,link_status,data_source,
    contact_authorized,internal_notes
  ) values (
    trim(p_nome),v_phone,nullif(trim(p_email),''),trim(p_municipio),trim(p_bairro),
    v_link.leader_member_id,'cadastrado','participante','participante',
    'pendente_revisao','informado_lideranca','Link de cadastro da base',
    coalesce(p_contact_authorized,false),nullif(trim(p_observacao),'')
  ) returning id into v_id;

  insert into public.audit_logs(action,entity_type,entity_id,new_data_resumida)
  values ('public_collection_submitted','network_member',v_id::text,
    jsonb_build_object('source','collection_link','contact_authorized',coalesce(p_contact_authorized,false)));
  return v_id;
end $$;

revoke all on function public.submit_collection_member(text,text,text,text,text,text,text,boolean) from public;
grant execute on function public.submit_collection_member(text,text,text,text,text,text,text,boolean) to anon,authenticated;

-- Índices para os principais filtros e relacionamentos.
create index if not exists profiles_territory_idx on public.profiles(territory_id);
create index if not exists network_members_coordinator_idx on public.network_members(coordinator_id);
create index if not exists network_members_invited_by_idx on public.network_members(invited_by_profile_id);
create index if not exists network_members_activated_by_idx on public.network_members(activated_by);
create index if not exists invitations_inviter_idx on public.invitations(inviter_profile_id);
create index if not exists activities_responsible_idx on public.activities(responsible_profile_id);
create index if not exists activities_member_idx on public.activities(member_id);
create index if not exists consent_records_member_idx on public.consent_records(member_id);
create index if not exists privacy_requests_member_idx on public.privacy_requests(member_id);
create index if not exists collection_links_leader_idx on public.collection_links(leader_member_id);
create index if not exists collection_links_created_by_idx on public.collection_links(created_by);
create index if not exists import_batches_responsible_idx on public.import_batches(responsible_profile_id);
create index if not exists import_batches_reference_idx on public.import_batches(reference_member_id);
