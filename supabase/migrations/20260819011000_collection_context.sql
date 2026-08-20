create or replace function public.get_collection_link_context(p_token text)
returns table(leader_id uuid, leader_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path=''
as $$
  select n.id, n.nome, l.expires_at
  from public.collection_links l
  join public.network_members n on n.id=l.leader_member_id
  where length(coalesce(p_token,'')) >= 24
    and l.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and l.active and l.expires_at>now()
  limit 1
$$;
revoke all on function public.get_collection_link_context(text) from public;
grant execute on function public.get_collection_link_context(text) to anon,authenticated;
