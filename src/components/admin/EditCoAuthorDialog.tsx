import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { joinName, splitName } from '@/lib/nameParts';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coAuthor?: any;
  articleId?: string;
  invalidateKeys?: any[][];
}

export function EditCoAuthorDialog({ open, onOpenChange, coAuthor, articleId, invalidateKeys = [] }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', affiliation: '', orcid: '' });

  useEffect(() => {
    if (coAuthor) {
      const fallback = splitName(coAuthor.name);
      setForm({
        first_name: coAuthor.first_name || fallback.firstName,
        last_name: coAuthor.last_name || fallback.lastName,
        email: coAuthor.email || '',
        affiliation: coAuthor.affiliation || '',
        orcid: coAuthor.orcid || '',
      });
    } else {
      setForm({ first_name: '', last_name: '', email: '', affiliation: '', orcid: '' });
    }
  }, [coAuthor]);

  const save = useMutation({
    mutationFn: async () => {
      const firstName = form.first_name.trim().slice(0, 100);
      const lastName = form.last_name.trim().slice(0, 100);
      const name = joinName(firstName, lastName);
      if (!firstName || !lastName || !form.email.trim()) throw new Error('First name, last name, and email are required');
      const values = {
        first_name: firstName, last_name: lastName, name,
        email: form.email.trim(),
        affiliation: form.affiliation.trim().slice(0, 200) || null,
        orcid: form.orcid.trim().slice(0, 50) || null,
      };
      const request = coAuthor?.id
        ? supabase.from('co_authors').update(values).eq('id', coAuthor.id)
        : supabase.from('co_authors').insert({ ...values, article_id: articleId || '' });
      const { error } = await request;
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ['admin-co-authors'] });
      toast.success(coAuthor?.id ? 'Co-author updated' : 'Co-author added');
      onOpenChange(false);
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong">
        <DialogHeader>
          <DialogTitle className="gradient-text">{coAuthor?.id ? 'Edit Co-Author' : 'Add Co-Author'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>First Name</Label>
              <Input className="glass-input" value={form.first_name} onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input className="glass-input" value={form.last_name} onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="gradient-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : coAuthor?.id ? 'Save' : 'Add Co-Author'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
