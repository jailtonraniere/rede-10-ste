-- Permite que a aplicação exclua registros, mantendo a autorização na política RLS.
grant delete on public.network_members to authenticated;

-- Registra exclusões no mesmo histórico usado por inclusões e alterações.
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
      'parent_member_id', old.parent_member_id
    ) end,
    case when tg_op in ('INSERT', 'UPDATE') then jsonb_build_object(
      'status', new.status,
      'registration_status', new.registration_status,
      'link_status', new.link_status,
      'participation_type', new.participation_type,
      'parent_member_id', new.parent_member_id,
      'data_source', new.data_source
    ) end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_network_member_changes on public.network_members;
create trigger audit_network_member_changes
after insert or update or delete on public.network_members
for each row execute function private.audit_network_member_changes();

revoke all on function private.audit_network_member_changes() from public, anon, authenticated;
