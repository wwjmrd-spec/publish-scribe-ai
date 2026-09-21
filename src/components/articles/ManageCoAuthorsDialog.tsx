import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil, Plus } from 'lucide-react';
import { EditCoAuthorDialog } from '@/components/admin/EditCoAuthorDialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  articleTitle: string;
  articleId: string;
  coAuthors: any[];
  invalidateKeys?: any[][];
}

export function ManageCoAuthorsDialog({ open, onOpenChange, articleTitle, articleId, coAuthors, invalidateKeys = [] }: Props) {
  const [editing, setEditing] = useState<any>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass-card-strong max-w-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text">Manage Co-Authors</DialogTitle>
          </DialogHeader>
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm text-muted-foreground line-clamp-2">{articleTitle}</p>
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
          {coAuthors.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No co-authors on this article.</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {coAuthors.map((ca) => (
                <div
                  key={ca.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[hsl(var(--glass-bg))]"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium truncate">{ca.first_name || '—'} {ca.last_name || ''}</p>
                    <p className="text-xs text-muted-foreground">First: {ca.first_name || '—'} · Last: {ca.last_name || '—'}</p>
                    <p className="text-muted-foreground truncate">{ca.email}</p>
                    {ca.affiliation && (
                      <p className="text-xs text-muted-foreground truncate">{ca.affiliation}</p>
                    )}
                    {ca.orcid && (
                      <p className="text-xs text-muted-foreground truncate">ORCID: {ca.orcid}</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditing(ca)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editing && (
        <EditCoAuthorDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          coAuthor={editing}
          invalidateKeys={invalidateKeys}
        />
      )}
      {adding && (
        <EditCoAuthorDialog
          open={adding}
          onOpenChange={setAdding}
          articleId={articleId}
          invalidateKeys={invalidateKeys}
        />
      )}
    </>
  );
}
