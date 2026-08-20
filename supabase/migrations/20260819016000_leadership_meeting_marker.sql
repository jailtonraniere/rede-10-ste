alter table public.network_members
  add column if not exists needs_candidate_meeting boolean not null default false;

alter table public.network_members
  drop constraint if exists leadership_meeting_marker_role_check;
alter table public.network_members
  add constraint leadership_meeting_marker_role_check
  check (not needs_candidate_meeting or member_role = 'lideranca');

comment on column public.network_members.needs_candidate_meeting is
  'Marcador operacional: liderança solicitou ou precisa de reunião com a candidata.';
