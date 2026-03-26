
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Focus embeddings table for semantic search
CREATE TABLE public.focus_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_item_id uuid NOT NULL REFERENCES public.team_focus(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  content text NOT NULL,
  content_type text NOT NULL DEFAULT 'description',
  embedding extensions.vector(1536),
  created_at timestamptz DEFAULT now()
);

-- RLS: SELECT only for team members (INSERT/UPDATE via service_role from edge functions)
ALTER TABLE public.focus_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view embeddings"
  ON public.focus_embeddings FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

-- HNSW index for fast cosine similarity search
CREATE INDEX focus_embeddings_hnsw_idx
  ON public.focus_embeddings USING hnsw (embedding extensions.vector_cosine_ops);

-- Unique constraint: one embedding per focus_item + content_type
CREATE UNIQUE INDEX focus_embeddings_item_type_idx
  ON public.focus_embeddings (focus_item_id, content_type);

-- Semantic search RPC function
CREATE OR REPLACE FUNCTION public.match_focus_embeddings(
  query_embedding extensions.vector(1536),
  match_team_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (focus_item_id uuid, content text, content_type text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT fe.focus_item_id, fe.content, fe.content_type,
    (1 - (fe.embedding <=> query_embedding))::float AS similarity
  FROM public.focus_embeddings fe
  WHERE fe.team_id = match_team_id
    AND (1 - (fe.embedding <=> query_embedding)) > match_threshold
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Add error column to focus_retrospectives for failed status tracking
ALTER TABLE public.focus_retrospectives ADD COLUMN IF NOT EXISTS error_message text;
