import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export function DeleteCoAuthorButton({ id, name, invalidateKeys = [] }: {
  id: string; name: string; invalidateKeys?: readonly (readonly unknown[])[];
}) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('co_authors').delete().eq('id', id).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('You do not have permission to delete this co-author.');
    },
    onSuccess: () => {
      for (const queryKey of [...invalidateKeys, ['admin-co-authors'], ['my-articles'], ['admin-articles']]) {
        qc.invalidateQueries({ queryKey });
      }
      toast.success('Co-author deleted');
    },
    onError: (error) => toast.error('Could not delete co-author: ' + error.message),
  });
  return <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive"
    title="Delete co-author" aria-label={`Delete co-author ${name}`} disabled={remove.isPending}
    onClick={() => {
      if (window.confirm(`Delete ${name || 'this co-author'}? Their co-author certificates will also be removed. This cannot be undone.`)) remove.mutate();
    }}><Trash2 className="h-4 w-4" /></Button>;
}