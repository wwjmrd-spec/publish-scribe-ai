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
  author: any;
}

export function EditAuthorDialog({ open, onOpenChange, author }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ full_name: '', email: '', affiliation: '', country: '', orcid: '' });

  useEffect(() => {
    if (author) {
      setForm({
        full_name: author.full_name || '',
        email: author.email || '',
        affiliation: author.affiliation || '',
        country: author.country || '',
        orcid: author.orcid || '',
      });
    }
  }, [author]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name.trim().slice(0, 100),
          email: form.email.trim(),
          affiliation: form.affiliation.trim().slice(0, 200),
          country: form.country.trim().slice(0, 100),
          orcid: form.orcid.trim().slice(0, 50) || null,
          is_indian: form.country.trim().toLowerCase() === 'india',
        })
        .eq('id', author.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-author-detail', author.id] });
      qc.invalidateQueries({ queryKey: ['admin-authors'] });
      toast.success('Author updated');
      onOpenChange(false);
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong">
        <DialogHeader>
          <DialogTitle className="gradient-text">Edit Author</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Full Name</Label>
            <Input className="glass-input" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input className="glass-input" type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Affiliation</Label>
            <Input className="glass-input" value={form.affiliation} onChange={(e) => setForm(f => ({ ...f, affiliation: e.target.value }))} />
          </div>
          <div>
            <Label>ORCID iD</Label>
            <Input className="glass-input" placeholder="0000-0002-1825-0097" value={form.orcid} onChange={(e) => setForm(f => ({ ...f, orcid: e.target.value }))} />
          </div>
          <div>
            <Label>Country</Label>
            <Input className="glass-input" value={form.country} onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} />
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
