import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useGenerateSubject() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generateSubject = async (abstract: string): Promise<string | null> => {
    if (!abstract || abstract.trim().length < 20) {
      toast({
        title: 'Abstract too short',
        description: 'Please write at least 20 characters in the abstract to generate a subject.',
        variant: 'destructive',
      });
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-subject', {
        body: { abstract: abstract.trim() },
      });

      if (error) throw error;

      if (data?.subject) {
        return data.subject;
      }

      toast({
        title: 'Could not generate subject',
        description: 'Please enter the subject manually.',
        variant: 'destructive',
      });
      return null;
    } catch (error: any) {
      console.error('Generate subject error:', error);
      toast({
        title: 'Failed to generate subject',
        description: error.message || 'Please enter the subject manually.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generateSubject, loading };
}
