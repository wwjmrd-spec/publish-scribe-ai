import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { EditCoAuthorDialog } from '@/components/admin/EditCoAuthorDialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  articleTitle: string;
  coAuthors: any[];
  invalidateKeys?: any[][];
}

export function ManageCoAuthorsDialog({ open, onOpenChange, articleTitle, coAuthors, invalidateKeys = [] }: Props) {
  const [editing, setEditing] = useState<any>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass-card-strong max-w-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text">Manage Co-Authors</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{articleTitle}</p>
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
                    <p className="font-medium truncate">{ca.name}</p>
                    <p className="text-muted-foreground truncate">{ca.email}</p>
                    {ca.affiliation && (
                      <p className="text-xs text-muted-foreground truncate">{ca.affiliation}</p>
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
    </>
  );
}
