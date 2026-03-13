ALTER TABLE public.ai_weekly_digests 
ADD COLUMN IF NOT EXISTS weekly_awards jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dora_metrics jsonb DEFAULT '{}'::jsonb;