import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileCheck, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { downloadDocument } from '@/lib/downloadDocument';
import { resolveEdgeFunctionError } from '@/lib/edgeFunctionError';
import { toast } from 'sonner';

export function AcceptanceLetterButton({ articleId, admin = false }: { articleId: string; admin?: boolean }) {
  const qc = useQueryClient();
  const { data: letter, isLoading } = useQuery({
    queryKey: ['acceptance-letter', articleId],
    queryFn: async () => {
      const { data, error } = await supabase.from('article_acceptance_letters').select('letter_number').eq('article_id', articleId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const action = useMutation({
    mutationFn: async () => {
      if (!letter) {
        const { data, error } = await supabase.functions.invoke('generate-acceptance-letter', { body: { articleId } });
        if (error) throw await resolveEdgeFunctionError(error, 'Could not create acceptance letter');
        if (!data?.success) throw new Error(data?.error || 'Could not create acceptance letter');
        await qc.invalidateQueries({ queryKey: ['acceptance-letter', articleId] });
        toast.success('Acceptance letter created');
      }
      await downloadDocument({ articleId, fileType: 'acceptance_letter', label: 'acceptance letter' });
    },
    onError: (error) => toast.error(error.message),
  });
  if (isLoading || (!admin && !letter)) return null;
  return (
    <Button size="sm" variant="outline" disabled={action.isPending} onClick={(event) => { event.stopPropagation(); action.mutate(); }}>
      {action.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : letter ? <Download className="w-4 h-4 mr-2" /> : <FileCheck className="w-4 h-4 mr-2" />}
      {letter ? 'Acceptance Letter PDF' : 'Create Acceptance Letter'}
    </Button>
  );
}