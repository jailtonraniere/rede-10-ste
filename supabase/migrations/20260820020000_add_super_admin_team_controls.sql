alter table public.profiles
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists deleted_at timestamptz;

update public.profiles
set role = 'administrador',
    status = 'cadastrado',
    is_super_admin = true,
    deleted_at = null,
    updated_at = now()
where lower(email) = 'jailtonmjc@gmail.com';

create unique index if not exists profiles_single_super_admin
  on public.profiles (is_super_admin)
  where is_super_admin;

alter table public.profiles
  drop constraint if exists profiles_super_admin_role_check;
alter table public.profiles
  add constraint profiles_super_admin_role_check
  check (not is_super_admin or role = 'administrador');

revoke update(is_super_admin, deleted_at) on public.profiles from authenticated;

comment on column public.profiles.is_super_admin is
  'Administrador geral protegido; pode redefinir senhas e gerenciar o ciclo de vida da equipe.';
comment on column public.profiles.deleted_at is
  'Exclusão lógica do acesso, preservando autoria e histórico operacional.';
