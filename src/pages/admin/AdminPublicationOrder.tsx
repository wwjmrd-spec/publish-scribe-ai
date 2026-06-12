import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowUp, ArrowDown, Pin, PinOff, ListOrdered, Search, Save } from 'lucide-react';

type Article = {
  id: string;
  reference_number: string;
  title: string;
  author_name: string | null;
  publication_year: string | null;
  publish_queue_added_at: string | null;
  created_at: string;
  display_order: number | null;
};

export default function AdminPublicationOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-publication-order'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('articles')
        .select('id, reference_number, title, author_name, publication_year, publish_queue_added_at, created_at, display_order')
        .eq('status', 'published')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Article[];
    },
  });

  // Merge pending edits with server data and sort exactly like the public page.
  const sorted = useMemo(() => {
    const merged = rows.map((r) => ({
      ...r,
      display_order: r.id in pending ? pending[r.id] : r.display_order,
    }));
    return merged.sort((a, b) => {
      const ao = a.display_order, bo = b.display_order;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      const ta = new Date(a.publish_queue_added_at || a.created_at || 0).getTime();
      const tb = new Date(b.publish_queue_added_at || b.created_at || 0).getTime();
      if (tb !== ta) return tb - ta;
      return String(b.reference_number || '').localeCompare(String(a.reference_number || ''));
    });
  }, [rows, pending]);

  const filtered = sorted.filter((r) =>
    !search ||
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.reference_number.toLowerCase().includes(search.toLowerCase()) ||
    (r.author_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const pinnedCount = sorted.filter((r) => r.display_order != null).length;
  const hasPending = Object.keys(pending).length > 0;

  const setOrder = (id: string, value: number | null) => {
    setPending((p) => ({ ...p, [id]: value }));
  };

  const moveUp = (id: string) => {
    const idx = sorted.findIndex((r) => r.id === id);
    if (idx <= 0) return;
    // Build a new pinned order [1..N] where current pinned positions stay,
    // then swap this row with the one above.
    const newOrder: { id: string; pos: number }[] = sorted
      .filter((r) => r.display_order != null || r.id === id || sorted[idx - 1].id === r.id)
      .map((r, i) => ({ id: r.id, pos: i + 1 }));
    // simple swap of the two top-most positions involving these two ids:
    const a = newOrder.findIndex((x) => x.id === sorted[idx - 1].id);
    const b = newOrder.findIndex((x) => x.id === id);
    if (a >= 0 && b >= 0) {
      const tmp = newOrder[a].pos; newOrder[a].pos = newOrder[b].pos; newOrder[b].pos = tmp;
    }
    const updates: Record<string, number | null> = { ...pending };
    newOrder.forEach((x) => { updates[x.id] = x.pos; });
    setPending(updates);
  };

  const moveDown = (id: string) => {
    const idx = sorted.findIndex((r) => r.id === id);
    if (idx < 0 || idx >= sorted.length - 1) return;
    const newOrder: { id: string; pos: number }[] = sorted
      .filter((r) => r.display_order != null || r.id === id || sorted[idx + 1].id === r.id)
      .map((r, i) => ({ id: r.id, pos: i + 1 }));
    const a = newOrder.findIndex((x) => x.id === sorted[idx + 1].id);
    const b = newOrder.findIndex((x) => x.id === id);
    if (a >= 0 && b >= 0) {
      const tmp = newOrder[a].pos; newOrder[a].pos = newOrder[b].pos; newOrder[b].pos = tmp;
    }
    const updates: Record<string, number | null> = { ...pending };
    newOrder.forEach((x) => { updates[x.id] = x.pos; });
    setPending(updates);
  };

  const pinTop = (id: string) => {
    // Find lowest current order and place this one at lowest - 1 (so it floats above).
    let minOrder = Infinity;
    for (const r of sorted) {
      const v = r.id in pending ? pending[r.id] : r.display_order;
      if (v != null && v < minOrder) minOrder = v;
    }
    const next = minOrder === Infinity ? 1 : Math.max(1, minOrder - 1);
    if (next === 1 && minOrder === 1) {
      // shift everything down by 1
      const updates: Record<string, number | null> = { ...pending };
      sorted.forEach((r) => {
        const v = r.id in pending ? pending[r.id] : r.display_order;
        if (v != null) updates[r.id] = v + 1;
      });
      updates[id] = 1;
      setPending(updates);
    } else {
      setOrder(id, next);
    }
  };

  const unpin = (id: string) => setOrder(id, null);

  const save = async () => {
    if (!hasPending) return;
    setSaving(true);
    try {
      // Bulk update by issuing parallel updates per row (small set in practice).
      const updates = Object.entries(pending);
      await Promise.all(updates.map(([id, val]) =>
        (supabase as any).from('articles').update({ display_order: val }).eq('id', id)
      ));
      toast({ title: 'Order saved', description: `${updates.length} article${updates.length === 1 ? '' : 's'} updated.` });
      setPending({});
      qc.invalidateQueries({ queryKey: ['admin-publication-order'] });
      qc.invalidateQueries({ queryKey: ['public-publications'] });
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout type="admin">
        <div className="flex items-center justify-center h-64"><GlassSpinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-2">
          <ListOrdered className="w-6 h-6" /> Publication Order
        </h1>
        <p className="text-muted-foreground text-sm">
          Pin or reorder published articles. Pinned items appear first on the home page and Publications list (applies to all visitors). Unpinned items continue to show in most-recent order.
        </p>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 glass-input" />
        </div>
        <div className="text-xs text-muted-foreground sm:mr-2">{pinnedCount} pinned · {sorted.length} total</div>
        <Button onClick={save} disabled={!hasPending || saving} className="gradient-primary">
          <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving…' : `Save${hasPending ? ` (${Object.keys(pending).length})` : ''}`}
        </Button>
      </div>

      <GlassCard className="p-0 overflow-hidden">
        <ul className="divide-y divide-[hsl(var(--glass-border))]">
          {filtered.map((r, i) => {
            const order = r.id in pending ? pending[r.id] : r.display_order;
            const dirty = r.id in pending;
            return (
              <li key={r.id} className={`flex items-center gap-3 p-3 ${dirty ? 'bg-primary/5' : ''}`}>
                <div className="w-10 text-center">
                  {order != null ? (
                    <Badge>{order}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="font-mono">{r.reference_number}</span>
                    {r.author_name ? ` · ${r.author_name}` : ''}
                    {r.publication_year ? ` · ${r.publication_year}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => moveUp(r.id)} title="Move up"><ArrowUp className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => moveDown(r.id)} title="Move down"><ArrowDown className="w-4 h-4" /></Button>
                  {order != null ? (
                    <Button size="icon" variant="ghost" onClick={() => unpin(r.id)} title="Unpin"><PinOff className="w-4 h-4" /></Button>
                  ) : (
                    <Button size="icon" variant="ghost" onClick={() => pinTop(r.id)} title="Pin to top"><Pin className="w-4 h-4" /></Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </GlassCard>
    </DashboardLayout>
  );
}
