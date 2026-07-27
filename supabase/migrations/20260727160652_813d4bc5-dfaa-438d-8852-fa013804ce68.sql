
REVOKE EXECUTE ON FUNCTION public.match_knowledge_base(vector, int) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.match_faq(vector, int) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.match_support_tickets(vector, int) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.match_knowledge_base(vector, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_faq(vector, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_support_tickets(vector, int) TO service_role;
