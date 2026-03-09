
SELECT cron.schedule(
  'sync-clickup-activity',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hlfshnuzwkncfhyuutpa.supabase.co/functions/v1/clickup-sync-activity',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsZnNobnV6d2tuY2ZoeXV1dHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzUyMzQsImV4cCI6MjA4ODIxMTIzNH0.di1tEYrSyTCx4ndcZOZbOoOy9wEu4Zw5Zg6keybQqMg"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'sync-github-activity',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hlfshnuzwkncfhyuutpa.supabase.co/functions/v1/github-sync-activity',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsZnNobnV6d2tuY2ZoeXV1dHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzUyMzQsImV4cCI6MjA4ODIxMTIzNH0.di1tEYrSyTCx4ndcZOZbOoOy9wEu4Zw5Zg6keybQqMg"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
