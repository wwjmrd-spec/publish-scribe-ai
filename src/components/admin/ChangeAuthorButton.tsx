import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Pencil, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  articleId: string;
  currentAuthorId: string;
  currentLabel?: string;
}

export function ChangeAuthorButton({ articleId, currentAuthorId, currentLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: authors = [], isLoading } = useQuery({
    queryKey: ['admin-author-search', search],
    queryFn: async () => {
      const q = supabase
        .from('profiles')
        .select('id, full_name, email, country, affiliation')
        .neq('id', currentAuthorId)
        .limit(20);
      const filtered = search.trim()
        ? q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
        : q.order('created_at', { ascending: false });
      const { data, error } = await filtered;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const reassign = async (newAuthorId: string, fullName: string, email: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('articles')
        .update({
          author_id: newAuthorId,
          author_name: fullName || email,
        })
        .eq('id', articleId);
      if (error) throw error;
      toast.success(`Article reassigned to ${fullName || email}`);
      queryClient.invalidateQueries({ queryKey: ['admin-article-detail', articleId] });
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
      setOpen(false);
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="w-3.5 h-3.5 mr-1" /> Change Author
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Article</DialogTitle>
            <DialogDescription>
              Currently submitted by <strong>{currentLabel || 'unknown'}</strong>. Pick another author account to take ownership.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-72 overflow-auto mt-2 space-y-1">
            {isLoading ? (
              <div className="flex justify-center py-6"><GlassSpinner size="sm" /></div>
            ) : authors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No matching authors.</p>
            ) : authors.map((a: any) => (
              <button
                key={a.id}
                disabled={saving}
                onClick={() => reassign(a.id, a.full_name, a.email)}
                className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition flex items-center gap-2"
              >
                <UserCheck className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.full_name || '(no name)'}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
