-- Execute em homologação depois de aplicar todas as migrações.
-- Teste estrutural somente leitura para a proteção de equipe e função.
begin;

do $$
declare
  v_trigger text;
  v_function text;
  v_insert_check text;
begin
  select lower(pg_get_triggerdef(t.oid)), lower(pg_get_functiondef(t.tgfoid))
    into v_trigger, v_function
  from pg_trigger t
  where t.tgrelid = 'public.network_members'::regclass
    and t.tgname = 'protect_team_membership_change'
    and not t.tgisinternal;

  if v_trigger is null
     or v_trigger not like '%update of is_team_member, member_role, participation_type%' then
    raise exception 'Trigger não protege todos os campos de equipe e função';
  end if;

  if v_function not like '%new.is_team_member is distinct from old.is_team_member%'
     or v_function not like '%new.member_role is distinct from old.member_role%'
     or v_function not like '%new.participation_type is distinct from old.participation_type%'
     or v_function not like '%administrador%' then
    raise exception 'Função de proteção administrativa incompleta';
  end if;

  select lower(with_check) into v_insert_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'network_members'
    and policyname = 'members_scoped_insert';

  if v_insert_check is null
     or v_insert_check !~ 'cadastrador.*member_role.*participante.*not is_team_member' then
    raise exception 'Policy de inserção permite função interna para cadastrador';
  end if;
end;
$$;

rollback;
