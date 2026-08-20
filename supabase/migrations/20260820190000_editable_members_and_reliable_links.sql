-- Permite editar cadastros com login sem deixar o perfil de acesso divergente.
create or replace function private.sync_network_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null and (
    new.nome is distinct from old.nome
    or new.email is distinct from old.email
    or new.telefone_normalizado is distinct from old.telefone_normalizado
    or new.municipio is distinct from old.municipio
    or new.bairro is distinct from old.bairro
  ) then
    update public.profiles
    set nome = new.nome,
        email = new.email,
        telefone = new.telefone_normalizado,
        municipio = new.municipio,
        bairro = new.bairro,
        updated_at = now()
    where id = new.profile_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_network_member_profile on public.network_members;
create trigger sync_network_member_profile
after update of nome,email,telefone_normalizado,municipio,bairro
on public.network_members
for each row execute function private.sync_network_member_profile();

revoke all on function private.sync_network_member_profile() from public, anon, authenticated;

-- Separa inserção e atualização: o administrador pode substituir um link criado
-- por outro administrador, mas o autor original de cada link não pode ser alterado.
drop policy if exists collection_links_authorized_write on public.collection_links;
drop policy if exists collection_links_authorized_insert on public.collection_links;
drop policy if exists collection_links_authorized_update on public.collection_links;

create policy collection_links_authorized_insert on public.collection_links
for insert to authenticated with check (
  created_by = private.current_profile_id()
  and (
    private.current_role() = 'administrador'
    or (
      private.current_role() = 'coordenador'
      and exists (
        select 1 from public.network_members n
        where n.id = leader_member_id
          and n.territory_id = private.current_territory_id()
      )
    )
  )
);

create policy collection_links_authorized_update on public.collection_links
for update to authenticated using (
  private.current_role() = 'administrador'
  or (
    private.current_role() = 'coordenador'
    and exists (
      select 1 from public.network_members n
      where n.id = leader_member_id
        and n.territory_id = private.current_territory_id()
    )
  )
) with check (
  private.current_role() = 'administrador'
  or (
    private.current_role() = 'coordenador'
    and exists (
      select 1 from public.network_members n
      where n.id = leader_member_id
        and n.territory_id = private.current_territory_id()
    )
  )
);

create or replace function private.preserve_collection_link_creator()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists preserve_collection_link_creator on public.collection_links;
create trigger preserve_collection_link_creator
before update on public.collection_links
for each row execute function private.preserve_collection_link_creator();

revoke all on function private.preserve_collection_link_creator() from public, anon, authenticated;

-- A rotação ocorre em uma única transação: se a criação falhar, o link anterior
-- continua ativo.
create or replace function public.rotate_collection_link(
  p_leader_member_id uuid,
  p_token_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link_id uuid;
  v_profile_id uuid := private.current_profile_id();
begin
  if v_profile_id is null then raise exception 'Sessao invalida'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Token invalido'; end if;

  update public.collection_links
  set active = false,
      revoked_at = now()
  where leader_member_id = p_leader_member_id
    and active;

  insert into public.collection_links(leader_member_id, token_hash, created_by)
  values (p_leader_member_id, p_token_hash, v_profile_id)
  returning id into v_link_id;

  return v_link_id;
end;
$$;

revoke all on function public.rotate_collection_link(uuid,text) from public, anon;
grant execute on function public.rotate_collection_link(uuid,text) to authenticated;
