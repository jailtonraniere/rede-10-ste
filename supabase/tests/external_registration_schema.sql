-- Execute em homologação depois de aplicar todas as migrações.
-- Verificações estruturais do autocadastro externo, sem alterar dados.
begin;

do $$
declare
  v_constraint text;
  v_submit_function text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'network_members'
      and column_name = 'indicated_by_member_id'
      and data_type = 'uuid'
  ) then
    raise exception 'Campo de indicação declarada ausente';
  end if;

  select pg_get_constraintdef(oid)
    into v_constraint
  from pg_constraint
  where conname = 'collection_links_kind_leader_check'
    and conrelid = 'public.collection_links'::regclass;

  if v_constraint is null
     or v_constraint not ilike '%leadership%'
     or v_constraint not ilike '%general%' then
    raise exception 'Restrição de tipo do link externo ausente ou inválida';
  end if;

  select pg_get_functiondef(p.oid)
    into v_submit_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'submit_collection_member'
    and pg_get_function_identity_arguments(p.oid) = 'p_token text, p_nome text, p_telefone text, p_email text, p_municipio text, p_bairro text, p_observacao text, p_treatment_authorized boolean, p_contact_authorized boolean, p_indicated_by_member_id uuid';

  if v_submit_function is null
     or v_submit_function not ilike '%parent_member_id%null%indicated_by_member_id%'
     or v_submit_function not ilike '%consentimento obrigatorio%' then
    raise exception 'Função de autocadastro não separa indicação, vínculo e consentimento';
  end if;

  if not has_function_privilege('anon', 'public.get_external_registration_context(text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.search_public_referral_leaders(text,text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.submit_collection_member(text,text,text,text,text,text,text,boolean,boolean,uuid)', 'EXECUTE') then
    raise exception 'APIs públicas do link externo sem permissões explícitas para anon';
  end if;

  if has_function_privilege('anon', 'public.rotate_external_registration_link(text)', 'EXECUTE') then
    raise exception 'Usuário anônimo não pode gerar link externo';
  end if;
end
$$;

rollback;
