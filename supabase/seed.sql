-- Dados exclusivamente fictícios. Crie usuários no Auth antes de associar profiles.auth_user_id.
insert into public.territories(id,nome,tipo,ativo) values
 ('00000000-0000-0000-0000-000000000101','Zona Norte','regiao',true),
 ('00000000-0000-0000-0000-000000000102','Centro','regiao',true),
 ('00000000-0000-0000-0000-000000000103','Orla','regiao',true)
on conflict do nothing;
