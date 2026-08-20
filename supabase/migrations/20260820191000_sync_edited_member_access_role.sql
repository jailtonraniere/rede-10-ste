-- Mantém o perfil de login coerente quando o tipo do cadastro é editado.
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
    or new.member_role is distinct from old.member_role
  ) then
    update public.profiles
    set nome = new.nome,
        email = new.email,
        telefone = new.telefone_normalizado,
        municipio = new.municipio,
        bairro = new.bairro,
        role = new.member_role,
        updated_at = now()
    where id = new.profile_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_network_member_profile on public.network_members;
create trigger sync_network_member_profile
after update of nome,email,telefone_normalizado,municipio,bairro,member_role
on public.network_members
for each row execute function private.sync_network_member_profile();

revoke all on function private.sync_network_member_profile() from public, anon, authenticated;
