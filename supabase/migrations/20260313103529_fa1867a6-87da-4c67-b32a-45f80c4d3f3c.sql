-- One-time trigger for badge detection (will unschedule after first run)
SELECT cron.schedule(
  'one-time-badge-detect',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hlfshnuzwkncfhyuutpa.supabase.co/functions/v1/detect-badges',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsZnNobnV6d2tuY2ZoeXV1dHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzUyMzQsImV4cCI6MjA4ODIxMTIzNH0.di1tEYrSyTCx4ndcZOZbOoOy9wEu4Zw5Zg6keybQqMg"}'::jsonb,
    body := '{"team_id": "d921254a-c5d6-4eda-b346-01829c5872ca"}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule badge-detection-cron for every 30 mins (offset from sync jobs)
SELECT cron.schedule(
  'badge-detection-cron',
  '15,45 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hlfshnuzwkncfhyuutpa.supabase.co/functions/v1/badge-detection-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsZnNobnV6d2tuY2ZoeXV1dHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzUyMzQsImV4cCI6MjA4ODIxMTIzNH0.di1tEYrSyTCx4ndcZOZbOoOy9wEu4Zw5Zg6keybQqMg"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);