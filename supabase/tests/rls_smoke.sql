-- Rode em ambiente de teste, nunca em produção. Verificações estruturais básicas.
begin;
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('profiles','network_members','invitations','territories','activities','consent_records','privacy_requests','audit_logs');
select indexname from pg_indexes where schemaname='public' and indexname in ('network_members_active_phone','invitations_pending_phone');
rollback;
