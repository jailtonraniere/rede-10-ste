alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_unique on public.profiles(lower(username)) where username is not null;

alter table public.network_members
  add column if not exists created_by_profile_id uuid references public.profiles(id);
create index if not exists network_members_created_by_idx on public.network_members(created_by_profile_id);

create or replace function private.assign_member_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by_profile_id is null and (select auth.uid()) is not null then
    new.created_by_profile_id := private.current_profile_id();
  end if;
  return new;
end;
$$;

drop trigger if exists assign_member_creator on public.network_members;
create trigger assign_member_creator
before insert on public.network_members
for each row execute function private.assign_member_creator();
revoke all on function private.assign_member_creator() from public,anon,authenticated;

drop policy if exists members_select on public.network_members;
drop policy if exists members_invite_insert on public.network_members;
drop policy if exists members_admin_all on public.network_members;
drop policy if exists members_mapping_insert on public.network_members;
drop policy if exists members_mapping_update on public.network_members;

create policy members_scoped_select on public.network_members
for select to authenticated using (
  private.current_role() = 'administrador'
  or created_by_profile_id = private.current_profile_id()
);
create policy members_scoped_insert on public.network_members
for insert to authenticated with check (
  private.current_role() = 'administrador'
  or (private.current_role() = 'cadastrador' and created_by_profile_id = private.current_profile_id())
);
create policy members_scoped_update on public.network_members
for update to authenticated using (
  private.current_role() = 'administrador'
  or (private.current_role() = 'cadastrador' and created_by_profile_id = private.current_profile_id())
) with check (
  private.current_role() = 'administrador'
  or (private.current_role() = 'cadastrador' and created_by_profile_id = private.current_profile_id())
);
create policy members_admin_delete on public.network_members
for delete to authenticated using (private.current_role() = 'administrador');

comment on column public.network_members.created_by_profile_id is
  'Responsável pelo cadastro; define o escopo de visualização dos cadastradores.';
