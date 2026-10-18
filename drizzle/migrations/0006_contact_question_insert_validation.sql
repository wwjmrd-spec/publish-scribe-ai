DROP POLICY IF EXISTS "Anyone can submit a contact question" ON public.contact_questions;
CREATE POLICY "Anyone can submit a valid contact question" ON public.contact_questions
FOR INSERT TO anon, authenticated
WITH CHECK (
  status = 'new'
  AND admin_notes IS NULL
  AND char_length(name) BETWEEN 1 AND 200
  AND char_length(email) BETWEEN 3 AND 255
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND char_length(subject) BETWEEN 1 AND 300
  AND char_length(message) BETWEEN 1 AND 5000
  AND (phone IS NULL OR char_length(phone) <= 40)
);