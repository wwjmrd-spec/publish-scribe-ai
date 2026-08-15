import React from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Mail, Building, Plus, X } from 'lucide-react';

export interface CoAuthor {
  id: string;
  name: string;
  email: string;
  affiliation: string;
  orcid?: string;
}

interface CoAuthorsSectionProps {
  coAuthors: CoAuthor[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof CoAuthor, value: string) => void;
}

export function CoAuthorsSection({ coAuthors, onAdd, onRemove, onUpdate }: CoAuthorsSectionProps) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Co-Authors
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Add Co-Author
        </Button>
      </div>

      {coAuthors.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">
          No co-authors added yet. Click "Add Co-Author" to add.
        </p>
      ) : (
        <div className="space-y-4">
          {coAuthors.map((coAuthor, index) => (
            <motion.div
              key={coAuthor.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] relative"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => onRemove(coAuthor.id)}
              >
                <X className="w-4 h-4" />
              </Button>

              <p className="text-sm text-muted-foreground mb-3">Co-Author {index + 1}</p>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Name *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={coAuthor.name}
                      onChange={(e) => onUpdate(coAuthor.id, 'name', e.target.value)}
                      placeholder="Full name"
                      className="glass-input pl-10 h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={coAuthor.email}
                      onChange={(e) => onUpdate(coAuthor.id, 'email', e.target.value)}
                      placeholder="Email address"
                      className="glass-input pl-10 h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Affiliation</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={coAuthor.affiliation}
                      onChange={(e) => onUpdate(coAuthor.id, 'affiliation', e.target.value)}
                      placeholder="University/Institute"
                      className="glass-input pl-10 h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">ORCID iD</Label>
                  <div className="relative">
                    <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={coAuthor.orcid || ''}
                      onChange={(e) => onUpdate(coAuthor.id, 'orcid', e.target.value)}
                      placeholder="0000-0002-1825-0097"
                      className="glass-input pl-10 h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
