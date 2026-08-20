-- Perfis são gerenciados pela função de servidor. O cliente só pode editar dados pessoais básicos.
revoke insert, update, delete, truncate, references, trigger
  on public.profiles from authenticated;

grant select on public.profiles to authenticated;
grant update(nome, email, telefone, municipio, bairro, updated_at)
  on public.profiles to authenticated;
