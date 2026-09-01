SELECT cron.unschedule('slack-standup-reminders');
SELECT cron.unschedule('slack-followup-reminders');
INSERT INTO public.notification_preferences (team_id, notification_type, enabled, updated_at)
SELECT t.id, 'daily_reminder', false, now() FROM public.teams t
ON CONFLICT (team_id, notification_type) DO UPDATE SET enabled = false, updated_at = now();