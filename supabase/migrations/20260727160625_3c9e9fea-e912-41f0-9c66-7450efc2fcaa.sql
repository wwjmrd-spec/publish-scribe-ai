
create extension if not exists vector;

-- ===== Knowledge base / FAQ extensions =====
ALTER TABLE public.ai_knowledge_base
  ADD COLUMN IF NOT EXISTS question text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS embedding vector(3072);

ALTER TABLE public.ai_faq
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS embedding vector(3072);

CREATE INDEX IF NOT EXISTS ai_kb_embedding_idx
  ON public.ai_knowledge_base USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);
CREATE INDEX IF NOT EXISTS ai_faq_embedding_idx
  ON public.ai_faq USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

-- ===== Conversations =====
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text NOT NULL,
  channel text NOT NULL DEFAULT 'web',
  site text NOT NULL DEFAULT 'wwjmrdai',
  language text NOT NULL DEFAULT 'en',
  author_name text,
  author_email text,
  reference_number text,
  article_title text,
  country text,
  status text NOT NULL DEFAULT 'open',
  human_takeover boolean NOT NULL DEFAULT false,
  assigned_admin uuid,
  satisfaction smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO anon;
GRANT ALL ON public.chat_conversations TO service_role;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own conversations select" ON public.chat_conversations
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own conversations insert" ON public.chat_conversations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own conversations update" ON public.chat_conversations
  FOR UPDATE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  confidence numeric,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalated boolean NOT NULL DEFAULT false,
  feedback smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own messages select" ON public.chat_messages
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    ));
CREATE POLICY "own messages insert" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.chat_conversations c
            WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "own messages update" ON public.chat_messages
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- ===== Support tickets =====
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  user_id uuid,
  question text NOT NULL,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_name text,
  author_email text,
  reference_number text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  ai_confidence numeric,
  ai_suggested_answer text,
  human_answer text,
  answered_at timestamptz,
  answered_by uuid,
  learned boolean NOT NULL DEFAULT false,
  question_embedding vector(3072),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own tickets select" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own tickets insert" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins manage tickets" ON public.support_tickets
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete tickets" ON public.support_tickets
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS support_tickets_embedding_idx
  ON public.support_tickets USING hnsw ((question_embedding::halfvec(3072)) halfvec_cosine_ops);

-- ===== AI decision logs =====
CREATE TABLE IF NOT EXISTS public.chat_ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid,
  message_id uuid,
  question text,
  retrieved_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_score numeric,
  confidence numeric,
  escalated boolean NOT NULL DEFAULT false,
  escalation_reason text,
  model text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chat_ai_logs TO authenticated;
GRANT ALL ON public.chat_ai_logs TO service_role;
ALTER TABLE public.chat_ai_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ai logs" ON public.chat_ai_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ===== Timestamps =====
DROP TRIGGER IF EXISTS chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Semantic search =====
CREATE OR REPLACE FUNCTION public.match_knowledge_base(query_embedding vector(3072), match_count int DEFAULT 6)
RETURNS TABLE (id uuid, title text, question text, content text, category text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.id, k.title, k.question, k.content, k.category,
         1 - (k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))
  FROM public.ai_knowledge_base k
  WHERE k.is_active = true AND k.status = 'published' AND k.embedding IS NOT NULL
  ORDER BY k.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_faq(query_embedding vector(3072), match_count int DEFAULT 6)
RETURNS TABLE (id uuid, question text, answer text, category text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.question, f.answer, f.category,
         1 - (f.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))
  FROM public.ai_faq f
  WHERE f.is_active = true AND f.status = 'published' AND f.embedding IS NOT NULL
  ORDER BY f.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_support_tickets(query_embedding vector(3072), match_count int DEFAULT 3)
RETURNS TABLE (id uuid, question text, human_answer text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.question, t.human_answer,
         1 - (t.question_embedding::halfvec(3072) <=> query_embedding::halfvec(3072))
  FROM public.support_tickets t
  WHERE t.human_answer IS NOT NULL AND t.question_embedding IS NOT NULL
  ORDER BY t.question_embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;
