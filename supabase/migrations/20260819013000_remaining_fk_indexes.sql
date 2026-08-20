create index if not exists app_settings_updated_by_idx on public.app_settings(updated_by);
create index if not exists audit_logs_actor_profile_idx on public.audit_logs(actor_profile_id);
create index if not exists duplicate_reviews_member_a_idx on public.duplicate_reviews(member_a_id);
create index if not exists duplicate_reviews_member_b_idx on public.duplicate_reviews(member_b_id);
create index if not exists duplicate_reviews_resolved_by_idx on public.duplicate_reviews(resolved_by);
create index if not exists territories_coordinator_idx on public.territories(coordinator_id);
create index if not exists territories_parent_idx on public.territories(parent_territory_id);
