-- Adiciona a estimativa opcional de votos sem reinterpretar capacidade ou meta.
-- Nenhum registro existente é atualizado: o novo campo permanece nulo até ser informado.

alter table public.network_members
  add column if not exists estimated_votes integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'network_members_estimated_votes_positive'
      and conrelid = 'public.network_members'::regclass
  ) then
    alter table public.network_members
      add constraint network_members_estimated_votes_positive
      check (estimated_votes is null or estimated_votes > 0);
  end if;
end
$$;

comment on column public.network_members.estimated_votes is
  'Estimativa opcional de votos associada ao cadastro; independente de capacidade e meta operacionais.';

-- Mantém a estimativa no histórico resumido já produzido para alterações da pessoa.
create or replace function private.audit_network_member_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_profile_id();
  v_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  -- Envios anônimos por link são auditados pela função de coleta.
  if v_actor is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.audit_logs(
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    previous_data_resumida,
    new_data_resumida
  ) values (
    v_actor,
    case
      when tg_op = 'INSERT' then 'member.created'
      when tg_op = 'DELETE' then 'member.deleted'
      else 'member.updated'
    end,
    'network_member',
    v_id::text,
    case when tg_op in ('UPDATE', 'DELETE') then jsonb_build_object(
      'nome', old.nome,
      'status', old.status,
      'registration_status', old.registration_status,
      'link_status', old.link_status,
      'participation_type', old.participation_type,
      'parent_member_id', old.parent_member_id,
      'estimated_votes', old.estimated_votes
    ) end,
    case when tg_op in ('INSERT', 'UPDATE') then jsonb_build_object(
      'status', new.status,
      'registration_status', new.registration_status,
      'link_status', new.link_status,
      'participation_type', new.participation_type,
      'parent_member_id', new.parent_member_id,
      'data_source', new.data_source,
      'estimated_votes', new.estimated_votes
    ) end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.audit_network_member_changes() from public, anon, authenticated;
