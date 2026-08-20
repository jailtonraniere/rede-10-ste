update public.app_settings
set value = '{"mode":"mobilizacao","invitations_enabled":true}'::jsonb,
    updated_at = now()
where key = 'operating_mode';
