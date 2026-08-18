-- Evolução incremental: Modo Mapeamento. Pessoas continuam independentes de auth.users.
alter table public.network_members
  add column if not exists registration_status text not null default 'pendente_revisao'
    check (registration_status in ('importado','pendente_revisao','revisado','pronto_ativacao','ativado','inativo','duplicado','desligado')),
  add column if not exists link_status text not null default 'nao_informado'
    check (link_status in ('nao_informado','informado_lideranca','em_validacao','confirmado_pessoa','recusado','encerrado')),
  add column if not exists data_source text,
  add column if not exists contact_authorized boolean not null default false,
  add column if not exists internal_notes text,
  add column if not exists estimated_capacity integer check (estimated_capacity is null or estimated_capacity > 0),
  add column if not exists agreed_goal integer check (agreed_goal is null or agreed_goal > 0),
  add column if not exists goal_deadline date,
  add column if not exists estimate_confidence text check (estimate_confidence is null or estimate_confidence in ('baixo','medio','alto')),
  add column if not exists estimate_method text,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists activation_ready_at timestamptz,
  add column if not exists import_batch_id uuid;
alter table public.network_members add column if not exists access_username text unique;
alter table public.network_members add column if not exists activated_by uuid references public.profiles(id);

create or replace function private.validate_leadership_estimate() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.participation_type='mobilizador' and (new.estimated_capacity is null or new.estimated_capacity < 1) then
    raise exception 'Capacidade estimada obrigatoria para mobilizador';
  end if;
  return new;
end $$;
create trigger validate_leadership_estimate before insert or update of participation_type,estimated_capacity on public.network_members for each row execute function private.validate_leadership_estimate();

create table public.import_batches (
  id uuid primary key default gen_random_uuid(), name text not null, source text not null,
  responsible_profile_id uuid not null references public.profiles(id), reference_member_id uuid references public.network_members(id),
  total_rows integer not null default 0, imported_rows integer not null default 0, rejected_rows integer not null default 0,
  review_rows integer not null default 0, status text not null default 'concluido' check(status in ('processando','concluido','parcialmente_desfeito','desfeito')),
  created_at timestamptz not null default now(), undone_at timestamptz
);
alter table public.network_members add constraint network_members_import_batch_fk foreign key(import_batch_id) references public.import_batches(id);
create table public.duplicate_reviews (
  id uuid primary key default gen_random_uuid(), member_a_id uuid not null references public.network_members(id), member_b_id uuid not null references public.network_members(id),
  match_reasons jsonb not null default '[]', status text not null default 'pendente' check(status in ('pendente','unificado','separados','corrigido','transferido')),
  resolution_notes text, resolved_by uuid references public.profiles(id), created_at timestamptz not null default now(), resolved_at timestamptz,
  check(member_a_id<>member_b_id)
);
create table public.app_settings (
  key text primary key, value jsonb not null, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
insert into public.app_settings(key,value) values ('operating_mode','{"mode":"mapeamento","invitations_enabled":false}'::jsonb) on conflict(key) do nothing;

alter table public.import_batches enable row level security;
alter table public.duplicate_reviews enable row level security;
alter table public.app_settings enable row level security;
create policy mapping_import_scope on public.import_batches for select to authenticated using(private.current_role()='administrador' or (private.current_role()='coordenador' and responsible_profile_id=private.current_profile_id()));
create policy mapping_import_write on public.import_batches for all to authenticated using(private.current_role()='administrador' or (private.current_role()='coordenador' and responsible_profile_id=private.current_profile_id())) with check(private.current_role()='administrador' or (private.current_role()='coordenador' and responsible_profile_id=private.current_profile_id()));
create policy duplicates_admin_coordinator_select on public.duplicate_reviews for select to authenticated using(private.current_role() in ('administrador','coordenador'));
create policy duplicates_admin_write on public.duplicate_reviews for all to authenticated using(private.current_role()='administrador') with check(private.current_role()='administrador');
create policy settings_authorized_read on public.app_settings for select to authenticated using(private.current_role() in ('administrador','coordenador'));
create policy settings_admin_write on public.app_settings for all to authenticated using(private.current_role()='administrador') with check(private.current_role()='administrador');
create policy members_mapping_insert on public.network_members for insert to authenticated with check(
  private.current_role()='administrador' or (private.current_role()='coordenador' and territory_id=private.current_territory_id())
);
create policy members_mapping_update on public.network_members for update to authenticated using(
  private.current_role()='administrador' or (private.current_role()='coordenador' and territory_id=private.current_territory_id())
) with check(
  private.current_role()='administrador' or (private.current_role()='coordenador' and territory_id=private.current_territory_id())
);
grant select,insert,update on public.import_batches to authenticated;
grant select on public.duplicate_reviews,public.app_settings to authenticated;
grant insert,update on public.duplicate_reviews,public.app_settings to authenticated;

create index network_members_mapping_status_idx on public.network_members(registration_status,link_status);
create index network_members_import_batch_idx on public.network_members(import_batch_id);
comment on column public.network_members.estimated_capacity is 'Estimativa operacional; nunca representa votos ou pessoas confirmadas.';

create table public.collection_links (
  id uuid primary key default gen_random_uuid(), leader_member_id uuid not null references public.network_members(id),
  token_hash text not null unique, active boolean not null default true,
  expires_at timestamptz not null default now() + interval '30 days', created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), revoked_at timestamptz
);
alter table public.collection_links enable row level security;
create policy collection_links_authorized_read on public.collection_links for select to authenticated using(
  private.current_role()='administrador' or (private.current_role()='coordenador' and exists(select 1 from public.network_members n where n.id=leader_member_id and n.territory_id=private.current_territory_id()))
);
create policy collection_links_authorized_write on public.collection_links for all to authenticated using(
  private.current_role()='administrador' or (private.current_role()='coordenador' and exists(select 1 from public.network_members n where n.id=leader_member_id and n.territory_id=private.current_territory_id()))
) with check(created_by=private.current_profile_id());
grant select,insert,update on public.collection_links to authenticated;

create or replace function public.submit_collection_member(p_token text,p_nome text,p_telefone text,p_email text,p_municipio text,p_bairro text,p_observacao text,p_contact_authorized boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_link public.collection_links; v_phone text; v_id uuid;
begin
  if length(coalesce(p_token,''))<12 then raise exception 'Link invalido'; end if;
  select * into v_link from public.collection_links where token_hash=encode(public.digest(p_token,'sha256'),'hex') and active and expires_at>now() limit 1;
  if v_link.id is null then raise exception 'Link invalido ou expirado'; end if;
  v_phone:=regexp_replace(coalesce(p_telefone,''),'[^0-9]','','g');
  if length(v_phone) not between 10 and 15 then raise exception 'Telefone invalido'; end if;
  if exists(select 1 from public.network_members where telefone_normalizado=v_phone and status<>'desligado') then raise exception 'Cadastro ja existente'; end if;
  insert into public.network_members(nome,telefone_normalizado,email,municipio,bairro,parent_member_id,status,participation_type,registration_status,link_status,data_source,contact_authorized,internal_notes)
  values(trim(p_nome),v_phone,nullif(trim(p_email),''),trim(p_municipio),trim(p_bairro),v_link.leader_member_id,'cadastrado','participante','pendente_revisao','informado_lideranca','Link de cadastro da base',coalesce(p_contact_authorized,false),nullif(trim(p_observacao),'')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_collection_member(text,text,text,text,text,text,text,boolean) from public;
grant execute on function public.submit_collection_member(text,text,text,text,text,text,text,boolean) to anon,authenticated;
