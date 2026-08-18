-- Rede 10: esquema inicial. Execute em um projeto Supabase novo.
create extension if not exists pgcrypto;
create schema if not exists private;

create type public.app_role as enum ('administrador','coordenador','lideranca','mobilizador','participante');
create type public.member_status as enum ('convidado','cadastro_iniciado','cadastrado','mobilizador_pendente','mobilizador_ativo','meta_alcancada','inativo','desligado','bloqueado');
create type public.participation_type as enum ('participante','mobilizador');

create table public.territories (
  id uuid primary key default gen_random_uuid(), nome text not null, tipo text not null,
  parent_territory_id uuid references public.territories(id), coordinator_id uuid, ativo boolean not null default true,
  created_at timestamptz not null default now(), unique(nome,tipo,parent_territory_id)
);
create table public.profiles (
  id uuid primary key default gen_random_uuid(), auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null check(length(nome) between 2 and 160), email text, telefone text not null,
  municipio text not null, bairro text not null, role public.app_role not null default 'participante',
  status public.member_status not null default 'cadastrado', territory_id uuid references public.territories(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.territories add constraint territories_coordinator_fk foreign key(coordinator_id) references public.profiles(id);
create table public.network_members (
  id uuid primary key default gen_random_uuid(), profile_id uuid unique references public.profiles(id) on delete set null,
  nome text not null, telefone_normalizado text not null check(telefone_normalizado ~ '^[0-9]{10,15}$'), email text,
  municipio text not null, bairro text not null, parent_member_id uuid references public.network_members(id),
  invited_by_profile_id uuid references public.profiles(id), coordinator_id uuid references public.profiles(id), territory_id uuid references public.territories(id),
  status public.member_status not null default 'convidado', participation_type public.participation_type not null default 'participante',
  invite_code text not null unique default upper(encode(gen_random_bytes(6),'hex')), joined_at timestamptz,
  last_activity_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint no_self_parent check(parent_member_id is null or parent_member_id <> id)
);
create unique index network_members_active_phone on public.network_members(telefone_normalizado) where status not in ('desligado');
create unique index network_members_email_unique on public.network_members(lower(email)) where email is not null and status not in ('desligado');
create index network_members_parent_idx on public.network_members(parent_member_id);
create index network_members_territory_idx on public.network_members(territory_id,status);
create table public.invitations (
 id uuid primary key default gen_random_uuid(), inviter_profile_id uuid not null references public.profiles(id), invite_code text not null unique default upper(encode(gen_random_bytes(8),'hex')),
 nome_convidado text, telefone_convidado_normalizado text, status text not null default 'pendente' check(status in ('pendente','iniciado','aceito','vencido','cancelado')),
 expires_at timestamptz not null default now()+interval '14 days', accepted_at timestamptz, created_at timestamptz not null default now()
);
create unique index invitations_pending_phone on public.invitations(telefone_convidado_normalizado) where status in ('pendente','iniciado');
create table public.activities (id uuid primary key default gen_random_uuid(), member_id uuid not null references public.network_members(id), activity_type text not null, description text, responsible_profile_id uuid not null references public.profiles(id), occurred_at timestamptz not null default now(), next_action_at timestamptz, created_at timestamptz not null default now());
create table public.consent_records (id uuid primary key default gen_random_uuid(), member_id uuid not null references public.network_members(id), consent_type text not null check(consent_type in ('tratamento','comunicacoes')), consent_version text not null, accepted boolean not null, source text not null, accepted_at timestamptz not null default now(), revoked_at timestamptz);
create table public.privacy_requests (id uuid primary key default gen_random_uuid(), member_id uuid not null references public.network_members(id), request_type text not null check(request_type in ('correcao','revogacao','saida','exclusao')), status text not null default 'aberta', details text, created_at timestamptz not null default now(), resolved_at timestamptz);
create table public.audit_logs (id bigint generated always as identity primary key, actor_profile_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id text not null, previous_data_resumida jsonb, new_data_resumida jsonb, created_at timestamptz not null default now());

-- SECURITY DEFINER is limited to private helpers, fixes policy recursion, validates auth.uid,
-- has an empty search_path and is explicitly revoked from PUBLIC below.
create or replace function private.current_profile_id() returns uuid language sql stable security definer set search_path='' as $$ select id from public.profiles where (select auth.uid()) is not null and auth_user_id=(select auth.uid()) and status <> 'bloqueado' limit 1 $$;
create or replace function private.current_role() returns public.app_role language sql stable security definer set search_path='' as $$ select role from public.profiles where (select auth.uid()) is not null and auth_user_id=(select auth.uid()) and status <> 'bloqueado' limit 1 $$;
create or replace function private.current_territory_id() returns uuid language sql stable security definer set search_path='' as $$ select territory_id from public.profiles where (select auth.uid()) is not null and auth_user_id=(select auth.uid()) and status <> 'bloqueado' limit 1 $$;
create or replace function private.current_member_id() returns uuid language sql stable security definer set search_path='' as $$ select nm.id from public.network_members nm join public.profiles p on p.id=nm.profile_id where (select auth.uid()) is not null and p.auth_user_id=(select auth.uid()) and p.status <> 'bloqueado' limit 1 $$;
create or replace function private.is_direct_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$ select (select auth.uid()) is not null and exists(select 1 from public.network_members n where n.id=target and n.parent_member_id=private.current_member_id()) $$;

create or replace function private.prevent_network_cycle() returns trigger language plpgsql security invoker set search_path='' as $$
declare found_cycle boolean;
begin
 if new.parent_member_id is null then return new; end if;
 with recursive ancestors(id) as (select new.parent_member_id union all select n.parent_member_id from public.network_members n join ancestors a on n.id=a.id where n.parent_member_id is not null)
 select exists(select 1 from ancestors where id=new.id) into found_cycle;
 if found_cycle then raise exception 'Vinculo circular nao permitido'; end if; return new;
end $$;
create trigger prevent_network_cycle before insert or update of parent_member_id on public.network_members for each row execute function private.prevent_network_cycle();

alter table public.profiles enable row level security; alter table public.network_members enable row level security; alter table public.invitations enable row level security;
alter table public.territories enable row level security; alter table public.activities enable row level security; alter table public.consent_records enable row level security;
alter table public.privacy_requests enable row level security; alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (
 auth_user_id=(select auth.uid()) or private.current_role()='administrador' or (private.current_role()='coordenador' and territory_id=private.current_territory_id())
);
create policy profiles_self_update on public.profiles for update to authenticated using(auth_user_id=(select auth.uid())) with check(auth_user_id=(select auth.uid()));
create policy profiles_admin_all on public.profiles for all to authenticated using(private.current_role()='administrador') with check(private.current_role()='administrador');
create policy members_select on public.network_members for select to authenticated using (
 profile_id=private.current_profile_id() or private.current_role()='administrador' or (private.current_role()='coordenador' and territory_id=private.current_territory_id()) or private.is_direct_member(id)
);
create policy members_invite_insert on public.network_members for insert to authenticated with check(invited_by_profile_id=private.current_profile_id() and parent_member_id=private.current_member_id() and status='convidado');
create policy members_admin_all on public.network_members for all to authenticated using(private.current_role()='administrador') with check(private.current_role()='administrador');
create policy invitations_own on public.invitations for all to authenticated using(inviter_profile_id=private.current_profile_id() or private.current_role()='administrador') with check(inviter_profile_id=private.current_profile_id() or private.current_role()='administrador');
create policy territories_scope on public.territories for select to authenticated using(private.current_role()='administrador' or id=private.current_territory_id());
create policy territories_admin on public.territories for all to authenticated using(private.current_role()='administrador') with check(private.current_role()='administrador');
create policy activities_scope on public.activities for select to authenticated using(private.current_role()='administrador' or responsible_profile_id=private.current_profile_id() or private.is_direct_member(member_id) or (private.current_role()='coordenador' and exists(select 1 from public.network_members n where n.id=member_id and n.territory_id=private.current_territory_id())));
create policy activities_insert on public.activities for insert to authenticated with check(responsible_profile_id=private.current_profile_id() and (private.is_direct_member(member_id) or private.current_role() in ('administrador','coordenador')));
create policy consents_self on public.consent_records for select to authenticated using(private.current_role()='administrador' or member_id=private.current_member_id());
create policy consents_self_insert on public.consent_records for insert to authenticated with check(member_id=private.current_member_id());
create policy privacy_self on public.privacy_requests for select to authenticated using(private.current_role()='administrador' or member_id=private.current_member_id());
create policy privacy_self_insert on public.privacy_requests for insert to authenticated with check(member_id=private.current_member_id());
create policy audit_admin on public.audit_logs for select to authenticated using(private.current_role()='administrador');

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update(nome,email,telefone,municipio,bairro,updated_at) on public.profiles to authenticated;
grant select,insert,update on public.network_members,public.invitations,public.activities,public.consent_records,public.privacy_requests to authenticated;
grant select on public.territories,public.audit_logs to authenticated;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
revoke all on function private.current_profile_id(),private.current_role(),private.current_territory_id(),private.current_member_id(),private.is_direct_member(uuid) from public,anon;
grant execute on function private.current_profile_id(),private.current_role(),private.current_territory_id(),private.current_member_id(),private.is_direct_member(uuid) to authenticated;

comment on table public.network_members is 'Participantes voluntarios; cadastro nao representa intencao ou garantia de voto.';
