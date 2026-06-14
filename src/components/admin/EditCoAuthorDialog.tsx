import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coAuthor: any;
  invalidateKeys?: any[][];
}

export function EditCoAuthorDialog({ open, onOpenChange, coAuthor, invalidateKeys = [] }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', affiliation: '' });

  useEffect(() => {
    if (coAuthor) {
      setForm({
        name: coAuthor.name || '',
        email: coAuthor.email || '',
        affiliation: coAuthor.affiliation || '',
      });
    }
  }, [coAuthor]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('co_authors')
        .update({
          name: form.name.trim().slice(0, 200),
          email: form.email.trim(),
          affiliation: form.affiliation.trim().slice(0, 200),
        })
        .eq('id', coAuthor.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ['admin-co-authors'] });
      toast.success('Co-author updated');
      onOpenChange(false);
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong">
        <DialogHeader>
          <DialogTitle className="gradient-text">Edit Co-Author</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Name</Label>
            <Input className="glass-input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input className="glass-input" type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Affiliation</Label>
            <Input className="glass-input" value={form.affiliation} onChange={(e) => setForm(f => ({ ...f, affiliation: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="gradient-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
