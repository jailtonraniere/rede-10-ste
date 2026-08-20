create or replace function public.record_members_export(p_count integer, p_filters jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_profile_id();
begin
  if private.current_role() <> 'administrador' then
    raise exception 'Somente o administrador geral pode exportar a base';
  end if;
  if p_count < 0 then
    raise exception 'Quantidade de registros invalida';
  end if;
  insert into public.audit_logs(actor_profile_id, action, entity_type, entity_id, new_data_resumida)
  values (v_actor, 'members.exported', 'network_members', v_actor::text,
    jsonb_build_object('count', p_count, 'filters', coalesce(p_filters, '{}'::jsonb)));
end;
$$;

revoke all on function public.record_members_export(integer,jsonb) from public, anon;
grant execute on function public.record_members_export(integer,jsonb) to authenticated;
