-- Lideranças e mobilizadores podem cadastrar e consultar somente pessoas da própria rede.
-- Administradores mantêm visão geral; cadastradores continuam limitados ao que criaram.

drop policy if exists members_scoped_select on public.network_members;
create policy members_scoped_select
on public.network_members
for select
to authenticated
using (
  private.current_role() = 'administrador'
  or created_by_profile_id = private.current_profile_id()
  or profile_id = private.current_profile_id()
  or parent_member_id = private.current_member_id()
);

drop policy if exists members_scoped_insert on public.network_members;
create policy members_scoped_insert
on public.network_members
for insert
to authenticated
with check (
  private.current_role() = 'administrador'
  or (
    private.current_role() = 'cadastrador'
    and created_by_profile_id = private.current_profile_id()
  )
  or (
    private.current_role() in ('lideranca', 'mobilizador')
    and created_by_profile_id = private.current_profile_id()
    and member_role = 'participante'
    and parent_member_id = private.current_member_id()
  )
);

grant execute on function private.current_member_id() to authenticated;
