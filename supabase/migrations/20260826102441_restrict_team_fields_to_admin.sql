-- Restringe classificação e função da equipe à administração sem alterar dados.
-- A migração é incremental e idempotente: apenas substitui função, trigger e policy.

create or replace function private.protect_team_membership_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (select private.current_role()) <> 'administrador'
     and (
       new.is_team_member is distinct from old.is_team_member
       or new.member_role is distinct from old.member_role
       or new.participation_type is distinct from old.participation_type
     ) then
    raise exception 'Somente administradores podem alterar a participação ou a função da equipe';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_team_membership_change on public.network_members;
create trigger protect_team_membership_change
before update of is_team_member,member_role,participation_type
on public.network_members
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
    and member_role = 'participante'
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
