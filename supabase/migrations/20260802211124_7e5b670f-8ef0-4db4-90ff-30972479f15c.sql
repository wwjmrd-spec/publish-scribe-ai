ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS deleted_for text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_deleted_for_check;

ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_deleted_for_check
  CHECK (deleted_for IN ('none','all','admin','author'));