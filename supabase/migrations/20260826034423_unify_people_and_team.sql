-- Unifica pessoas e equipe sem apagar, recriar ou mesclar registros existentes.
-- network_members permanece como cadastro canônico; profiles/auth.users permanecem
-- responsáveis exclusivamente por autenticação, permissões e status de acesso.

alter table public.network_members
  add column if not exists is_team_member boolean not null default false,
  add column if not exists record_origin text not null default 'base';

alter table public.network_members
  drop constraint if exists network_members_record_origin_check;
alter table public.network_members
  add constraint network_members_record_origin_check
  check (record_origin in ('base','equipe','importacao','autocadastro'));

-- Perfis legados de acesso podem não ter telefone válido. A interface continua
-- exigindo telefone para novos cadastros; apenas o backfill pode preservar NULL.
alter table public.network_members
  alter column telefone_normalizado drop not null;

-- A função da pessoa e a permissão do perfil de acesso passam a ser conceitos
-- independentes. Todos os papéis já existentes no enum continuam válidos.
alter table public.network_members
  drop constraint if exists network_members_operational_role_check;
alter table public.network_members
  add constraint network_members_operational_role_check
  check (member_role in (
    'administrador','cadastrador','coordenador','lideranca','mobilizador','participante'
  ));

create index if not exists network_members_team_filter_idx
  on public.network_members(is_team_member, created_at);
create index if not exists network_members_record_origin_idx
  on public.network_members(record_origin);

comment on column public.network_members.is_team_member is
  'Classificação da pessoa como integrante da equipe; independente de possuir login.';
comment on column public.network_members.record_origin is
  'Origem auditável do cadastro canônico: base, equipe, importação ou autocadastro.';

create or replace function private.assign_member_record_origin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.import_batch_id is not null or new.registration_status = 'importado' then
    new.record_origin := 'importacao';
  elsif coalesce(new.data_source, '') ilike '%autocadastro%' then
    new.record_origin := 'autocadastro';
  end if;
  return new;
end;
$$;

drop trigger if exists assign_member_record_origin on public.network_members;
create trigger assign_member_record_origin
before insert or update of import_batch_id,registration_status,data_source
on public.network_members
for each row execute function private.assign_member_record_origin();

revoke all on function private.assign_member_record_origin() from public, anon, authenticated;

create table if not exists public.person_unification_runs (
  run_key text primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  before_counts jsonb not null default '{}'::jsonb,
  after_counts jsonb,
  linked_existing_count integer not null default 0,
  created_member_count integer not null default 0,
  conflict_count integer not null default 0
);

create table if not exists public.person_identity_conflicts (
  id uuid primary key default gen_random_uuid(),
  run_key text not null references public.person_unification_runs(run_key),
  profile_id uuid not null references public.profiles(id),
  candidate_member_id uuid not null references public.network_members(id),
  generated_member_id uuid references public.network_members(id),
  match_reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pendente'
    check (status in ('pendente','confirmado_mesma_pessoa','confirmado_pessoas_distintas')),
  resolution_notes text,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(profile_id, candidate_member_id),
  check(candidate_member_id is distinct from generated_member_id)
);

create index if not exists person_identity_conflicts_run_key_idx
  on public.person_identity_conflicts(run_key);
create index if not exists person_identity_conflicts_candidate_member_idx
  on public.person_identity_conflicts(candidate_member_id);
create index if not exists person_identity_conflicts_generated_member_idx
  on public.person_identity_conflicts(generated_member_id)
  where generated_member_id is not null;
create index if not exists person_identity_conflicts_resolved_by_idx
  on public.person_identity_conflicts(resolved_by)
  where resolved_by is not null;

alter table public.person_unification_runs enable row level security;
alter table public.person_identity_conflicts enable row level security;

drop policy if exists person_unification_runs_admin_read on public.person_unification_runs;
create policy person_unification_runs_admin_read
on public.person_unification_runs for select to authenticated
using ((select private.current_role()) = 'administrador');

drop policy if exists person_identity_conflicts_admin_read on public.person_identity_conflicts;
create policy person_identity_conflicts_admin_read
on public.person_identity_conflicts for select to authenticated
using ((select private.current_role()) = 'administrador');

drop policy if exists person_identity_conflicts_admin_update on public.person_identity_conflicts;
create policy person_identity_conflicts_admin_update
on public.person_identity_conflicts for update to authenticated
using ((select private.current_role()) = 'administrador')
with check ((select private.current_role()) = 'administrador');

grant select on public.person_unification_runs to authenticated;
grant select,update on public.person_identity_conflicts to authenticated;

-- A linha de execução funciona como sentinela. Se o arquivo for reaplicado depois
-- de concluído, nenhum backfill é repetido e alterações manuais posteriores são
-- preservadas.
insert into public.person_unification_runs(run_key, before_counts)
values (
  'unify_people_team_v1',
  jsonb_build_object(
    'profiles', (select count(*) from public.profiles),
    'network_members', (select count(*) from public.network_members),
    'profile_linked_members', (select count(*) from public.network_members where profile_id is not null),
    'activities', (select count(*) from public.activities),
    'invitations', (select count(*) from public.invitations),
    'consent_records', (select count(*) from public.consent_records),
    'privacy_requests', (select count(*) from public.privacy_requests),
    'import_batches', (select count(*) from public.import_batches),
    'duplicate_reviews', (select count(*) from public.duplicate_reviews),
    'collection_links', (select count(*) from public.collection_links)
  )
)
on conflict (run_key) do nothing;

-- Candidatos são gerados exclusivamente por e-mail exato normalizado ou telefone
-- normalizado válido. Nome nunca participa da correspondência.
with candidate_pairs as (
  select
    p.id as profile_id,
    nm.id as member_id,
    to_jsonb(array_remove(array[
      case when nullif(lower(btrim(p.email)), '') = nullif(lower(btrim(nm.email)), '')
        then 'email_normalizado' end,
      case when length(regexp_replace(coalesce(p.telefone,''), '[^0-9]', '', 'g')) between 10 and 15
             and regexp_replace(coalesce(p.telefone,''), '[^0-9]', '', 'g') = nm.telefone_normalizado
        then 'telefone_normalizado' end
    ], null)) as reasons,
    count(*) over (partition by p.id) as profile_candidate_count,
    count(*) over (partition by nm.id) as member_candidate_count,
    nm.profile_id as candidate_profile_id
  from public.profiles p
  join public.network_members nm on (
    (nullif(lower(btrim(p.email)), '') is not null
      and nullif(lower(btrim(p.email)), '') = nullif(lower(btrim(nm.email)), ''))
    or
    (length(regexp_replace(coalesce(p.telefone,''), '[^0-9]', '', 'g')) between 10 and 15
      and regexp_replace(coalesce(p.telefone,''), '[^0-9]', '', 'g') = nm.telefone_normalizado)
  )
  where not exists (
    select 1 from public.network_members linked where linked.profile_id = p.id
  )
)
insert into public.person_identity_conflicts(
  run_key, profile_id, candidate_member_id, match_reasons
)
select 'unify_people_team_v1', profile_id, member_id, reasons
from candidate_pairs
where exists (
    select 1 from public.person_unification_runs r
    where r.run_key = 'unify_people_team_v1' and r.finished_at is null
  )
  and (
    profile_candidate_count <> 1
    or member_candidate_count <> 1
    or candidate_profile_id is not null
  )
on conflict(profile_id, candidate_member_id) do nothing;

-- Somente pares 1:1, ainda não vinculados, são ligados automaticamente.
with candidate_pairs as (
  select
    p.id as profile_id,
    nm.id as member_id,
    count(*) over (partition by p.id) as profile_candidate_count,
    count(*) over (partition by nm.id) as member_candidate_count
  from public.profiles p
  join public.network_members nm on (
    (nullif(lower(btrim(p.email)), '') is not null
      and nullif(lower(btrim(p.email)), '') = nullif(lower(btrim(nm.email)), ''))
    or
    (length(regexp_replace(coalesce(p.telefone,''), '[^0-9]', '', 'g')) between 10 and 15
      and regexp_replace(coalesce(p.telefone,''), '[^0-9]', '', 'g') = nm.telefone_normalizado)
  )
  where not exists (
    select 1 from public.network_members linked where linked.profile_id = p.id
  )
), unambiguous as (
  select profile_id, member_id
  from candidate_pairs
  where profile_candidate_count = 1 and member_candidate_count = 1
)
update public.network_members nm
set profile_id = u.profile_id,
    is_team_member = true
from unambiguous u
where nm.id = u.member_id
  and nm.profile_id is null
  and exists (
    select 1 from public.person_unification_runs r
    where r.run_key = 'unify_people_team_v1' and r.finished_at is null
  );

-- Registros que já tinham acesso ou função operacional são apenas marcados; seus
-- dados, vínculos, metas, histórico e timestamps permanecem intocados.
update public.network_members
set is_team_member = true
where (profile_id is not null or member_role <> 'participante')
  and not is_team_member
  and exists (
    select 1 from public.person_unification_runs r
    where r.run_key = 'unify_people_team_v1' and r.finished_at is null
  );

update public.network_members
set record_origin = case
  when import_batch_id is not null or registration_status = 'importado' then 'importacao'
  when data_source ilike '%autocadastro%' then 'autocadastro'
  else 'base'
end
where exists (
  select 1 from public.person_unification_runs r
  where r.run_key = 'unify_people_team_v1' and r.finished_at is null
);

-- Perfis sem pessoa correspondente ganham uma única linha canônica ligada ao
-- profile original. Contatos conflitantes ficam no profile e são exibidos via
-- relação; não são copiados para violar a unicidade nem forçar uma mescla.
insert into public.network_members(
  profile_id, nome, telefone_normalizado, email, municipio, bairro,
  status, participation_type, member_role, registration_status, link_status,
  data_source, record_origin, is_team_member, access_username,
  joined_at, last_activity_at, created_at, updated_at
)
select
  p.id,
  p.nome,
  case
    when length(regexp_replace(coalesce(p.telefone,''), '[^0-9]', '', 'g')) between 10 and 15
      and not exists (
        select 1 from public.network_members n
        where n.telefone_normalizado = regexp_replace(coalesce(p.telefone,''), '[^0-9]', '', 'g')
          and n.status <> 'desligado'
      )
    then regexp_replace(p.telefone, '[^0-9]', '', 'g')
  end,
  case
    when nullif(lower(btrim(p.email)), '') is not null
      and not exists (
        select 1 from public.network_members n
        where lower(n.email) = lower(btrim(p.email)) and n.status <> 'desligado'
      )
    then btrim(p.email)
  end,
  p.municipio,
  p.bairro,
  p.status,
  'participante',
  p.role,
  case when p.deleted_at is null and p.status <> 'bloqueado' then 'ativado' else 'inativo' end,
  'nao_informado',
  'Migração do cadastro legado da equipe',
  'equipe',
  true,
  case
    when p.username is not null
      and not exists (
        select 1 from public.network_members n where n.access_username = p.username
      )
    then p.username
  end,
  p.created_at,
  p.updated_at,
  p.created_at,
  p.updated_at
from public.profiles p
where not exists (
    select 1 from public.network_members n where n.profile_id = p.id
  )
  and exists (
    select 1 from public.person_unification_runs r
    where r.run_key = 'unify_people_team_v1' and r.finished_at is null
  );

update public.person_identity_conflicts c
set generated_member_id = generated.id
from public.network_members generated
where c.run_key = 'unify_people_team_v1'
  and generated.profile_id = c.profile_id
  and c.generated_member_id is null;

-- O relatório existente de duplicidades recebe os casos duvidosos, sem executar
-- qualquer unificação automática.
insert into public.duplicate_reviews(member_a_id, member_b_id, match_reasons, status)
select c.generated_member_id, c.candidate_member_id,
       coalesce(c.match_reasons, '[]'::jsonb) || '["migração equipe: revisão manual obrigatória"]'::jsonb,
       'pendente'
from public.person_identity_conflicts c
where c.run_key = 'unify_people_team_v1'
  and c.generated_member_id is not null
  and not exists (
    select 1 from public.duplicate_reviews d
    where (d.member_a_id = c.generated_member_id and d.member_b_id = c.candidate_member_id)
       or (d.member_a_id = c.candidate_member_id and d.member_b_id = c.generated_member_id)
  );

update public.person_unification_runs r
set finished_at = now(),
    after_counts = jsonb_build_object(
      'profiles', (select count(*) from public.profiles),
      'network_members', (select count(*) from public.network_members),
      'profile_linked_members', (select count(*) from public.network_members where profile_id is not null),
      'team_members', (select count(*) from public.network_members where is_team_member),
      'activities', (select count(*) from public.activities),
      'invitations', (select count(*) from public.invitations),
      'consent_records', (select count(*) from public.consent_records),
      'privacy_requests', (select count(*) from public.privacy_requests),
      'import_batches', (select count(*) from public.import_batches),
      'duplicate_reviews', (select count(*) from public.duplicate_reviews),
      'collection_links', (select count(*) from public.collection_links)
    ),
    created_member_count = (
      select count(*) from public.network_members
      where record_origin = 'equipe'
        and data_source = 'Migração do cadastro legado da equipe'
    ),
    linked_existing_count = greatest(
      0,
      ((select count(*) from public.profiles)
        - coalesce((r.before_counts ->> 'profile_linked_members')::integer, 0)
        - (select count(*) from public.network_members
           where record_origin = 'equipe'
             and data_source = 'Migração do cadastro legado da equipe'))
    ),
    conflict_count = (
      select count(*) from public.person_identity_conflicts c
      where c.run_key = r.run_key
    )
where r.run_key = 'unify_people_team_v1'
  and r.finished_at is null;

insert into public.audit_logs(action, entity_type, entity_id, new_data_resumida)
select 'person_team_unification.completed', 'migration', r.run_key,
       jsonb_build_object(
         'before', r.before_counts,
         'after', r.after_counts,
         'linked_existing', r.linked_existing_count,
         'created_members', r.created_member_count,
         'conflicts', r.conflict_count
       )
from public.person_unification_runs r
where r.run_key = 'unify_people_team_v1'
  and not exists (
    select 1 from public.audit_logs a
    where a.action = 'person_team_unification.completed'
      and a.entity_type = 'migration'
      and a.entity_id = r.run_key
  );

-- Integridade: aborta a transação se qualquer entidade histórica for removida ou
-- se algum perfil de acesso ficar sem sua pessoa canônica.
do $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  select before_counts, after_counts into v_before, v_after
  from public.person_unification_runs
  where run_key = 'unify_people_team_v1';

  if (v_before ->> 'profiles')::bigint <> (v_after ->> 'profiles')::bigint
    or (v_before ->> 'activities')::bigint <> (v_after ->> 'activities')::bigint
    or (v_before ->> 'invitations')::bigint <> (v_after ->> 'invitations')::bigint
    or (v_before ->> 'consent_records')::bigint <> (v_after ->> 'consent_records')::bigint
    or (v_before ->> 'privacy_requests')::bigint <> (v_after ->> 'privacy_requests')::bigint
    or (v_before ->> 'import_batches')::bigint <> (v_after ->> 'import_batches')::bigint
    or (v_before ->> 'collection_links')::bigint <> (v_after ->> 'collection_links')::bigint then
    raise exception 'Falha de integridade: total histórico alterado durante a unificação';
  end if;

  if exists (
    select 1 from public.profiles p
    where not exists (select 1 from public.network_members n where n.profile_id = p.id)
  ) then
    raise exception 'Falha de integridade: perfil de acesso sem pessoa canônica';
  end if;

  if exists (
    select 1 from public.network_members n
    where n.profile_id is not null and not n.is_team_member
  ) then
    raise exception 'Falha de integridade: usuário existente não marcado como equipe';
  end if;
end;
$$;

-- Mantém os dados pessoais sincronizados, mas não confunde função da pessoa com
-- permissão do usuário. Alterar permissões ocorre somente em Usuários da equipe.
create or replace function private.sync_network_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null and (
    new.nome is distinct from old.nome
    or new.email is distinct from old.email
    or new.telefone_normalizado is distinct from old.telefone_normalizado
    or new.municipio is distinct from old.municipio
    or new.bairro is distinct from old.bairro
  ) then
    update public.profiles
    set nome = new.nome,
        email = coalesce(new.email, email),
        telefone = coalesce(new.telefone_normalizado, telefone),
        municipio = new.municipio,
        bairro = new.bairro,
        updated_at = now()
    where id = new.profile_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_network_member_profile on public.network_members;
create trigger sync_network_member_profile
after update of nome,email,telefone_normalizado,municipio,bairro
on public.network_members
for each row execute function private.sync_network_member_profile();

revoke all on function private.sync_network_member_profile() from public, anon, authenticated;

create or replace function private.protect_team_membership_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.is_team_member is distinct from old.is_team_member
     and private.current_role() <> 'administrador' then
    raise exception 'Somente administradores podem alterar a participação na equipe';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_team_membership_change on public.network_members;
create trigger protect_team_membership_change
before update of is_team_member on public.network_members
for each row execute function private.protect_team_membership_change();

revoke all on function private.protect_team_membership_change() from public, anon, authenticated;

drop policy if exists members_scoped_insert on public.network_members;
create policy members_scoped_insert
on public.network_members
for insert
to authenticated
with check (
  (select private.current_role()) = 'administrador'
  or (
    (select private.current_role()) = 'cadastrador'
    and created_by_profile_id = (select private.current_profile_id())
    and not is_team_member
  )
  or (
    (select private.current_role()) in ('lideranca', 'mobilizador')
    and created_by_profile_id = (select private.current_profile_id())
    and member_role = 'participante'
    and not is_team_member
    and parent_member_id = (select private.current_member_id())
  )
);
