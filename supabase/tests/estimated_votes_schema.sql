do $$
declare
  v_constraint text;
  v_audit_function text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'network_members'
      and column_name = 'estimated_votes'
      and data_type = 'integer'
      and is_nullable = 'YES'
  ) then
    raise exception 'Campo opcional network_members.estimated_votes ausente ou inválido';
  end if;

  select pg_get_constraintdef(oid)
    into v_constraint
  from pg_constraint
  where conname = 'network_members_estimated_votes_positive'
    and conrelid = 'public.network_members'::regclass;

  if v_constraint is null
     or v_constraint not ilike '%estimated_votes%'
     or v_constraint not ilike '%> 0%' then
    raise exception 'Restrição positiva de estimated_votes ausente ou inválida';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'network_members'
      and column_name in ('estimated_capacity', 'agreed_goal')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Campos históricos de capacidade ou meta não foram preservados';
  end if;

  select pg_get_functiondef(p.oid)
    into v_audit_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'audit_network_member_changes';

  if v_audit_function is null or v_audit_function not ilike '%estimated_votes%' then
    raise exception 'Auditoria não registra estimated_votes';
  end if;
end
$$;
