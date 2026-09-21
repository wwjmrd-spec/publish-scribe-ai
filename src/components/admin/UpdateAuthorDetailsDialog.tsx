import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { joinName, splitName } from '@/lib/nameParts';

export interface AuthorDetail {
  /** co_authors.id — undefined for the corresponding (primary) author */
  coAuthorId?: string;
  isPrimary: boolean;
  firstName: string;
  lastName: string;
  name: string;
  affiliation: string;
  orcid: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  articleId: string;
  /** Patches the currently open formatted article with the new author details. */
  onApply: (authors: AuthorDetail[]) => Promise<void> | void;
}

export function UpdateAuthorDetailsDialog({ open, onOpenChange, articleId, onApply }: Props) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(null);
  const [authors, setAuthors] = useState<AuthorDetail[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [{ data: article, error: aErr }, { data: coAuthors, error: cErr }] = await Promise.all([
          supabase
            .from('articles')
            .select('author_name, author_id, profiles:author_id (full_name, first_name, last_name, affiliation, orcid)')
            .eq('id', articleId)
            .maybeSingle(),
          supabase
            .from('co_authors')
            .select('id, first_name, last_name, name, affiliation, orcid')
            .eq('article_id', articleId)
            .order('created_at', { ascending: true }),
        ]);
        if (aErr) throw aErr;
        if (cErr) throw cErr;
        if (cancelled) return;

        const profile: any = Array.isArray((article as any)?.profiles)
          ? (article as any).profiles[0]
          : (article as any)?.profiles;

        setAuthorProfileId(((article as any)?.author_id as string) || null);
        const primaryName = ((article as any)?.author_name || profile?.full_name || '').toString();
        const primaryParts = splitName(primaryName);
        setAuthors([
          {
            isPrimary: true,
            firstName: (profile?.first_name || primaryParts.firstName).toString(),
            lastName: (profile?.last_name || primaryParts.lastName).toString(),
            name: primaryName,
            affiliation: (profile?.affiliation || '').toString(),
            orcid: (profile?.orcid || '').toString(),
          },
          ...((coAuthors || []) as any[]).map((c) => {
            const parts = splitName(c.name);
            return {
              coAuthorId: c.id as string,
              isPrimary: false,
              firstName: (c.first_name || parts.firstName).toString(),
              lastName: (c.last_name || parts.lastName).toString(),
              name: (c.name || '').toString(),
              affiliation: (c.affiliation || '').toString(),
              orcid: (c.orcid || '').toString(),
            };
          }),
        ]);
      } catch (e: any) {
        toast.error('Could not load author details: ' + (e?.message || 'unknown error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, articleId]);

  const setField = (idx: number, key: keyof AuthorDetail, value: string) =>
    setAuthors((prev) => prev.map((a, i) => (i === idx ? { ...a, [key]: value } : a)));

  const handleSave = async () => {
    if (!authors.length) return;
    if (!authors[0].firstName.trim() || !authors[0].lastName.trim()) { toast.error('Corresponding author first and last names are required'); return; }
    setSaving(true);
    try {
      const primary = authors[0];
      const primaryName = joinName(primary.firstName, primary.lastName);

      const { error: artErr } = await supabase
        .from('articles')
        .update({ author_name: primaryName.slice(0, 200) } as any)
        .eq('id', articleId);
      if (artErr) throw artErr;

      if (authorProfileId) {
        const { error: profErr } = await supabase
          .from('profiles')
          .update({
            first_name: primary.firstName.trim().slice(0, 100),
            last_name: primary.lastName.trim().slice(0, 100),
            full_name: primaryName.slice(0, 200),
            affiliation: primary.affiliation.trim().slice(0, 300) || null,
            orcid: primary.orcid.trim().slice(0, 50) || null,
          } as any)
          .eq('id', authorProfileId);
        if (profErr) console.error('Profile update skipped:', profErr.message);
      }

      for (const co of authors.slice(1)) {
        if (!co.coAuthorId) continue;
        const { error: coErr } = await supabase
          .from('co_authors')
          .update({
            first_name: co.firstName.trim().slice(0, 100),
            last_name: co.lastName.trim().slice(0, 100),
            name: joinName(co.firstName, co.lastName).slice(0, 200),
            affiliation: co.affiliation.trim().slice(0, 300) || null,
            orcid: co.orcid.trim().slice(0, 50) || null,
          } as any)
          .eq('id', co.coAuthorId);
        if (coErr) throw coErr;
      }

       await onApply(authors.map((author) => ({ ...author, name: joinName(author.firstName, author.lastName) })));

      qc.invalidateQueries({ queryKey: ['admin-article-detail'] });
      qc.invalidateQueries({ queryKey: ['admin-articles'] });
      toast.success('Author details updated in the formatted article');
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Failed to update author details: ' + (e?.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="gradient-text">Update Author Details</DialogTitle>
          <DialogDescription>
            Changes the author names, affiliations and ORCID iDs inside the already formatted article.
            The article is not re-formatted, so all other content and page numbers stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><GlassSpinner size="lg" /></div>
        ) : (
          <div className="space-y-4 py-1">
            {authors.map((a, i) => (
              <div key={a.coAuthorId || 'primary'} className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] space-y-2">
                <p className="text-xs font-semibold text-primary">
                  {a.isPrimary ? 'Corresponding Author' : `Co-Author ${i}`}
                </p>
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">First Name</Label>
                    <Input className="glass-input" value={a.firstName} onChange={(e) => setField(i, 'firstName', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Last Name</Label>
                    <Input className="glass-input" value={a.lastName} onChange={(e) => setField(i, 'lastName', e.target.value)} />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">ORCID iD</Label>
                    <Input
                      className="glass-input"
                      placeholder="0000-0002-1825-0097"
                      value={a.orcid}
                      onChange={(e) => setField(i, 'orcid', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Affiliation / Designation</Label>
                  <Input
                    className="glass-input"
                    value={a.affiliation}
                    onChange={(e) => setField(i, 'affiliation', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="gradient-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? <GlassSpinner size="sm" /> : 'Update in Article'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
