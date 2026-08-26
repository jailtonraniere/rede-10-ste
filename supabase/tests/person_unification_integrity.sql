-- Execute em homologação depois de aplicar todas as migrações.
-- O teste é somente leitura, exceto por uma alteração revertida no final.
begin;

do $$
declare
  v_run public.person_unification_runs;
  v_member public.network_members;
  v_before jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'network_members'
      and column_name = 'is_team_member' and data_type = 'boolean'
  ) then
    raise exception 'Campo network_members.is_team_member ausente';
  end if;

  select * into v_run
  from public.person_unification_runs
  where run_key = 'unify_people_team_v1';

  if v_run.run_key is null or v_run.finished_at is null then
    raise exception 'Migração de unificação não foi concluída';
  end if;

  if exists (
    select p.id
    from public.profiles p
    left join public.network_members n on n.profile_id = p.id
    group by p.id
    having count(n.id) <> 1
  ) then
    raise exception 'Cada profile deve apontar para exatamente uma pessoa';
  end if;

  if exists (
    select 1 from public.network_members
    where profile_id is not null and not is_team_member
  ) then
    raise exception 'Existe usuário legado não marcado como equipe';
  end if;

  if (v_run.before_counts ->> 'profiles')::bigint <> (v_run.after_counts ->> 'profiles')::bigint
    or (v_run.before_counts ->> 'activities')::bigint <> (v_run.after_counts ->> 'activities')::bigint
    or (v_run.before_counts ->> 'invitations')::bigint <> (v_run.after_counts ->> 'invitations')::bigint
    or (v_run.before_counts ->> 'consent_records')::bigint <> (v_run.after_counts ->> 'consent_records')::bigint
    or (v_run.before_counts ->> 'privacy_requests')::bigint <> (v_run.after_counts ->> 'privacy_requests')::bigint
    or (v_run.before_counts ->> 'import_batches')::bigint <> (v_run.after_counts ->> 'import_batches')::bigint
    or (v_run.before_counts ->> 'collection_links')::bigint <> (v_run.after_counts ->> 'collection_links')::bigint then
    raise exception 'Os totais históricos antes/depois não conferem';
  end if;

  if exists (
    select 1
    from public.person_identity_conflicts c
    where c.generated_member_id is null
       or not exists (
         select 1 from public.duplicate_reviews d
         where (d.member_a_id = c.generated_member_id and d.member_b_id = c.candidate_member_id)
            or (d.member_a_id = c.candidate_member_id and d.member_b_id = c.generated_member_id)
       )
  ) then
    raise exception 'Conflito de identidade ausente do relatório de duplicidades';
  end if;

  -- Desmarcar equipe deve alterar somente a classificação. O rollback abaixo
  -- garante que nem mesmo essa mudança de teste persista em homologação.
  select * into v_member
  from public.network_members
  where is_team_member
  order by created_at
  limit 1;

  if v_member.id is not null then
    v_before := to_jsonb(v_member) - 'is_team_member' - 'updated_at';
    update public.network_members set is_team_member = false where id = v_member.id;
    if not exists (
      select 1 from public.network_members n
      where n.id = v_member.id
        and (to_jsonb(n) - 'is_team_member' - 'updated_at') = v_before
    ) then
      raise exception 'Desmarcar equipe alterou dados ou vínculos da pessoa';
    end if;
  end if;
end;
$$;

rollback;
