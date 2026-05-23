
-- Enable RLS on realtime.messages and restrict subscriptions to per-user notification topics
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can subscribe to their own notification channel" ON realtime.messages;
CREATE POLICY "Users can subscribe to their own notification channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() = ('notifications:' || auth.uid()::text))
);

DROP POLICY IF EXISTS "Users can send to their own notification channel" ON realtime.messages;
CREATE POLICY "Users can send to their own notification channel"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() = ('notifications:' || auth.uid()::text))
);
