import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tag,
  Plus,
  Trash2,
  Pencil,
  Calendar,
  Percent,
  DollarSign,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

type DiscountType = Database['public']['Enums']['discount_type'];
type DiscountCurrency = Database['public']['Enums']['discount_currency'];
type AppliesPart = 'article_fee' | 'pro_plan' | 'review_report' | 'doi';
type AppliesTo = string;
type PositionLimit = 'first' | 'second' | 'first_two' | 'any';

const PART_LABELS: Record<AppliesPart, string> = {
  article_fee: 'Article fees',
  pro_plan: 'Pro plan',
  review_report: 'Review report',
  doi: 'DOI',
};

const ALL_PARTS: AppliesPart[] = ['article_fee', 'pro_plan', 'review_report', 'doi'];

/** Decode the stored applies_to value into its individual parts. */
function parseAppliesTo(value?: string | null): AppliesPart[] {
  const v = (value || 'both').trim();
  if (v === 'all') return [...ALL_PARTS];
  if (v === 'both') return ['article_fee', 'pro_plan'];
  return v
    .split(',')
    .map((p) => p.trim())
    .filter((p): p is AppliesPart => (ALL_PARTS as string[]).includes(p));
}

/** Encode selected parts back into a stored applies_to value. */
function serializeAppliesTo(parts: AppliesPart[]): string {
  if (parts.length === 0) return 'article_fee';
  if (parts.length === ALL_PARTS.length) return 'all';
  if (parts.length === 2 && parts.includes('article_fee') && parts.includes('pro_plan')) return 'both';
  return ALL_PARTS.filter((p) => parts.includes(p)).join(',');
}

function appliesToLabel(value?: string | null): string {
  const parts = parseAppliesTo(value);
  if (parts.length === ALL_PARTS.length) return 'All (Article + Pro + Review report + DOI)';
  return parts.map((p) => PART_LABELS[p]).join(' + ') || '—';
}

const POSITION_LABELS: Record<PositionLimit, string> = {
  first: '1st article only',
  second: '2nd article only',
  first_two: '1st & 2nd articles',
  any: 'Any article',
};


export default function AdminDiscounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percentage' as DiscountType,
    discount_value: '',
    currency: 'BOTH' as DiscountCurrency,
    start_date: '',
    end_date: '',
    usage_limit: '',
    is_active: true,
    show_in_cart: false,
    applies_to: 'both' as AppliesTo,
    article_position_limit: 'any' as PositionLimit,
    specific_article_ids: [] as string[],
    max_uses_per_user: '',
    min_cart_value: '',
  });


  const { data: discounts, isLoading } = useQuery({
    queryKey: ['admin-discounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discount_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: articles } = useQuery({
    queryKey: ['admin-discounts-articles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, reference_number')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    enabled: isCreateDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        code: formData.code.toUpperCase(),
        discount_type: formData.discount_type,
        discount_value: parseFloat(formData.discount_value),
        currency: formData.currency,
        start_date: formData.start_date,
        end_date: formData.end_date,
        usage_limit: formData.usage_limit ? parseInt(formData.usage_limit) : null,
        is_active: formData.is_active,
        show_in_cart: formData.show_in_cart,
        applies_to: formData.applies_to,
        article_position_limit: formData.article_position_limit,
        specific_article_ids:
          formData.specific_article_ids.length > 0
            ? formData.specific_article_ids
            : null,
        max_uses_per_user: formData.max_uses_per_user
          ? parseInt(formData.max_uses_per_user)
          : null,
        min_cart_value: formData.min_cart_value
          ? parseFloat(formData.min_cart_value)
          : null,
      };

      if (editingId) {
        const { error } = await supabase.from('discount_codes').update(payload).eq('id', editingId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('discount_codes')
        .insert({ ...payload, created_by: user?.id });
      if (error) throw error;
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      await queryClient.refetchQueries({ queryKey: ['admin-discounts'] });
      toast.success('Discount code created');
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Failed to create: ' + (error?.message || 'Unknown error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('discount_codes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      await queryClient.refetchQueries({ queryKey: ['admin-discounts'] });
      toast.success('Discount code deleted');
    },
    onError: (error: any) => toast.error('Failed to delete: ' + (error?.message || 'Unknown error')),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('discount_codes')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      await queryClient.refetchQueries({ queryKey: ['admin-discounts'] });
    },
    onError: (error: any) => toast.error('Failed to update: ' + (error?.message || 'Unknown error')),
  });

  const toggleShowInCartMutation = useMutation({
    mutationFn: async ({ id, show_in_cart }: { id: string; show_in_cart: boolean }) => {
      const { error } = await supabase
        .from('discount_codes')
        .update({ show_in_cart } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      await queryClient.refetchQueries({ queryKey: ['admin-discounts'] });
      toast.success('Cart visibility updated');
    },
    onError: (error: any) => toast.error('Failed to update: ' + (error?.message || 'Unknown error')),
  });

  const toggleDefaultMutation = useMutation({
    mutationFn: async ({ id, makeDefault }: { id: string; makeDefault: boolean }) => {
      const { error } = await supabase
        .from('discount_codes')
        .update({ is_default: makeDefault, auto_apply: makeDefault } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      await queryClient.refetchQueries({ queryKey: ['admin-discounts'] });
      toast.success('Default coupon updated — it will auto-apply on the cart');
    },
    onError: (error: any) => toast.error('Failed to update: ' + (error?.message || 'Unknown error')),
  });

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      code: '',
      discount_type: 'percentage',
      discount_value: '',
      currency: 'BOTH',
      start_date: '',
      end_date: '',
      usage_limit: '',
      is_active: true,
      show_in_cart: false,
      applies_to: 'both',
      article_position_limit: 'any',
      specific_article_ids: [],
      max_uses_per_user: '',
      min_cart_value: '',
    });
  };

  const openEditDialog = (d: any) => {
    setEditingId(d.id);
    setFormData({
      code: d.code || '',
      discount_type: d.discount_type,
      discount_value: String(d.discount_value ?? ''),
      currency: d.currency,
      start_date: d.start_date ? new Date(d.start_date).toISOString().slice(0, 10) : '',
      end_date: d.end_date ? new Date(d.end_date).toISOString().slice(0, 10) : '',
      usage_limit: d.usage_limit != null ? String(d.usage_limit) : '',
      is_active: !!d.is_active,
      show_in_cart: !!d.show_in_cart,
      applies_to: d.applies_to || 'both',
      article_position_limit: (d.article_position_limit || 'any') as PositionLimit,
      specific_article_ids: d.specific_article_ids || [],
      max_uses_per_user: d.max_uses_per_user != null ? String(d.max_uses_per_user) : '',
      min_cart_value: d.min_cart_value != null ? String(d.min_cart_value) : '',
    });
    setIsCreateDialogOpen(true);
  };


  const toggleArticleId = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      specific_article_ids: prev.specific_article_ids.includes(id)
        ? prev.specific_article_ids.filter((x) => x !== id)
        : [...prev.specific_article_ids, id],
    }));
  };

  if (isLoading) {
    return (
      <DashboardLayout type="admin">
        <div className="flex items-center justify-center h-64">
          <GlassSpinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="admin">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2">Discount Codes</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Create and manage promotional codes</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          Create Code
        </Button>
      </motion.div>

      <AutoApplyPanel discounts={discounts || []} />


      <GlassCard>
        {!discounts?.length ? (
          <div className="text-center py-12">
            <Tag className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No discount codes yet</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
              Create your first code
            </Button>
          </div>
        ) : (
          <div>
            {/* Mobile cards */}
            <div className="space-y-3 sm:hidden">
              {discounts.map((discount) => (
                <div key={discount.id} className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-primary text-sm">{discount.code}</span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={discount.is_active || false}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: discount.id, is_active: checked })}
                      />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditDialog(discount)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 w-7 p-0" onClick={() => deleteMutation.mutate(discount.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>

                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                      {discount.discount_type === 'percentage' ? `${discount.discount_value}% off` : `${discount.discount_value} off`}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{discount.currency}</span>
                    <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground">
                      {appliesToLabel(discount.applies_to)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {POSITION_LABELS[(discount.article_position_limit as PositionLimit) || 'any']}
                    </span>
                    {discount.specific_article_ids?.length ? (
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {discount.specific_article_ids.length} specific article{discount.specific_article_ids.length > 1 ? 's' : ''}
                      </span>
                    ) : null}
                    {(discount as any).min_cart_value ? (
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        Min cart: {(discount as any).min_cart_value}
                      </span>
                    ) : null}
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Used: {discount.used_count || 0}/{discount.usage_limit ?? '∞'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Max/user: {discount.max_uses_per_user ?? '∞'}
                    </span>

                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-xs text-muted-foreground">Show in author cart</Label>
                    <Switch
                      checked={(discount as any).show_in_cart || false}
                      onCheckedChange={(checked) => toggleShowInCartMutation.mutate({ id: discount.id, show_in_cart: checked })}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(discount.start_date).toLocaleDateString()} - {new Date(discount.end_date).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[hsl(var(--glass-border))]">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Code</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Discount</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Currency</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Applies To</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Scope</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Validity</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Usage</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Max/User</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Active</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">In Cart</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Default (auto-apply)</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((discount) => {
                    const appliesTo = (discount.applies_to as AppliesTo) || 'both';
                    const position = (discount.article_position_limit as PositionLimit) || 'any';
                    const specificCount = discount.specific_article_ids?.length || 0;
                    return (
                      <tr key={discount.id} className="border-b border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-primary">{discount.code}</td>
                        <td className="py-3 px-4">
                          <span className="flex items-center gap-1">
                            {discount.discount_type === 'percentage' ? (
                              <><Percent className="w-3 h-3" />{discount.discount_value}%</>
                            ) : (
                              <><DollarSign className="w-3 h-3" />{discount.discount_value}</>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm">{discount.currency}</td>
                        <td className="py-3 px-4 text-sm">
                          <span className="px-2 py-0.5 rounded-full bg-accent/20 text-xs">
                            {appliesToLabel(appliesTo)}
                          </span>
                          {(discount as any).min_cart_value ? (
                            <div className="text-xs text-muted-foreground mt-1">
                              Min cart: {(discount as any).min_cart_value}
                            </div>
                          ) : null}
                        </td>

                        <td className="py-3 px-4 text-sm">
                          <div className="flex flex-col gap-0.5">
                            {appliesTo !== 'pro_plan' && (
                              <span className="text-xs">{POSITION_LABELS[position]}</span>
                            )}
                            {specificCount > 0 ? (
                              <span className="text-xs text-primary">
                                {specificCount} specific article{specificCount > 1 ? 's' : ''}
                              </span>
                            ) : appliesTo !== 'pro_plan' ? (
                              <span className="text-xs text-muted-foreground">All articles</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(discount.start_date).toLocaleDateString()} - {new Date(discount.end_date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">{discount.used_count || 0}/{discount.usage_limit ?? '∞'}</td>
                        <td className="py-3 px-4 text-sm">{discount.max_uses_per_user ?? '∞'}</td>
                        <td className="py-3 px-4">
                          <Switch checked={discount.is_active || false} onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: discount.id, is_active: checked })} />
                        </td>
                        <td className="py-3 px-4">
                          <Switch
                            checked={(discount as any).show_in_cart || false}
                            onCheckedChange={(checked) => toggleShowInCartMutation.mutate({ id: discount.id, show_in_cart: checked })}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={(discount as any).is_default || false}
                              onCheckedChange={(checked) => toggleDefaultMutation.mutate({ id: discount.id, makeDefault: checked })}
                            />
                            {(discount as any).is_default && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">DEFAULT</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditDialog(discount)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(discount.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="glass-card-strong max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="gradient-text">Create Discount Code</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Code</Label>
              <Input
                placeholder="SUMMER2025"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="glass-input uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select
                  value={formData.discount_type}
                  onValueChange={(v) => setFormData({ ...formData, discount_type: v as DiscountType })}
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Discount Amount {formData.discount_type === 'percentage' ? '(%)' : '(in selected currency)'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder={formData.discount_type === 'percentage' ? 'e.g. 10 for 10% off' : 'e.g. 100 for flat 100 off'}
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  className="glass-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.discount_type === 'percentage'
                    ? 'Enter percentage (1-100) to discount from total.'
                    : 'Enter the flat amount to subtract from the total.'}
                </p>
              </div>
            </div>

            <div>
              <Label>Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={(v) => setFormData({ ...formData, currency: v as DiscountCurrency })}
              >
                <SelectTrigger className="glass-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOTH">All Currencies</SelectItem>
                  <SelectItem value="INR">INR Only</SelectItem>
                  <SelectItem value="USD">USD Only</SelectItem>
                  <SelectItem value="USDT">USDT Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">Applies To</Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-lg border border-border/60">
                {(() => {
                  const parts = parseAppliesTo(formData.applies_to);
                  const toggle = (key: AppliesPart) => {
                    const next = parts.includes(key)
                      ? parts.filter((p) => p !== key)
                      : [...parts, key];
                    setFormData({ ...formData, applies_to: serializeAppliesTo(next) });
                  };
                  const allChecked = parts.length === ALL_PARTS.length;
                  return (
                    <>
                      {ALL_PARTS.map((part) => (
                        <label key={part} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={parts.includes(part)} onCheckedChange={() => toggle(part)} />
                          {PART_LABELS[part]}
                        </label>
                      ))}
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(c) =>
                            setFormData({ ...formData, applies_to: c ? 'all' : 'article_fee' })
                          }
                        />
                        All
                      </label>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Article Position Limit</Label>
                <Select
                  value={formData.article_position_limit}
                  onValueChange={(v) => setFormData({ ...formData, article_position_limit: v as PositionLimit })}
                  disabled={!parseAppliesTo(formData.applies_to).includes('article_fee')}
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any article</SelectItem>
                    <SelectItem value="first">1st article only</SelectItem>
                    <SelectItem value="second">2nd article only</SelectItem>
                    <SelectItem value="first_two">1st &amp; 2nd articles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Minimum Cart Value (optional)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="No minimum"
                  value={formData.min_cart_value}
                  onChange={(e) => setFormData({ ...formData, min_cart_value: e.target.value })}
                  className="glass-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Code applies only when the cart subtotal reaches this amount.
                </p>
              </div>
            </div>



            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="glass-input"
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="glass-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Total Usage Limit (optional)</Label>
                <Input
                  type="number"
                  placeholder="Unlimited"
                  value={formData.usage_limit}
                  onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                  className="glass-input"
                />
              </div>
              <div>
                <Label>Max Uses Per User (optional)</Label>
                <Input
                  type="number"
                  placeholder="Unlimited"
                  value={formData.max_uses_per_user}
                  onChange={(e) => setFormData({ ...formData, max_uses_per_user: e.target.value })}
                  className="glass-input"
                />
              </div>
            </div>

            {formData.applies_to !== 'pro_plan' && (
              <div>
                <Label>Specific Articles (optional)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Pick from the dropdown or paste reference numbers (comma-separated, e.g. ART-2026-0090, ART-2026-0089). Leave empty to apply to all eligible articles.
                </p>

                {/* Dropdown picker */}
                <Select
                  value=""
                  onValueChange={(id) => {
                    if (id && !formData.specific_article_ids.includes(id)) {
                      toggleArticleId(id);
                    }
                  }}
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue placeholder="Select an article to add..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {!articles?.length ? (
                      <div className="p-2 text-xs text-muted-foreground">No articles found.</div>
                    ) : (
                      articles
                        .filter((a) => !formData.specific_article_ids.includes(a.id))
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="font-mono text-xs text-primary mr-2">{a.reference_number}</span>
                            <span className="truncate">{a.title}</span>
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>

                {/* Text entry by reference number */}
                <Input
                  className="glass-input mt-2"
                  placeholder="Type reference numbers, comma-separated"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      const raw = (e.target as HTMLInputElement).value;
                      const refs = raw.split(',').map((r) => r.trim().toUpperCase()).filter(Boolean);
                      const matched: string[] = [];
                      const unknown: string[] = [];
                      refs.forEach((ref) => {
                        const found = articles?.find((a) => a.reference_number.toUpperCase() === ref);
                        if (found && !formData.specific_article_ids.includes(found.id)) {
                          matched.push(found.id);
                        } else if (!found) {
                          unknown.push(ref);
                        }
                      });
                      if (matched.length) {
                        setFormData((prev) => ({
                          ...prev,
                          specific_article_ids: [...prev.specific_article_ids, ...matched],
                        }));
                      }
                      if (unknown.length) toast.error(`Unknown: ${unknown.join(', ')}`);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />

                {/* Selected chips */}
                {formData.specific_article_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 p-2 rounded-md border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))]">
                    {formData.specific_article_ids.map((id) => {
                      const art = articles?.find((a) => a.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs"
                        >
                          <span className="font-mono">{art?.reference_number || id.slice(0, 8)}</span>
                          <button
                            type="button"
                            onClick={() => toggleArticleId(id)}
                            className="hover:text-destructive"
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Selected: {formData.specific_article_ids.length}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>Active immediately</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.show_in_cart}
                onCheckedChange={(checked) => setFormData({ ...formData, show_in_cart: checked })}
              />
              <Label>Show in author cart (publicly listed)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {editingId ? 'Save Changes' : 'Create Code'}
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function AutoApplyPanel({ discounts }: { discounts: any[] }) {
  const queryClient = useQueryClient();
  const { data: setting } = useQuery({
    queryKey: ['auto-apply-discount'],
    queryFn: async () => {
      const { data } = await supabase
        .from('admin_settings').select('setting_value').eq('setting_key', 'auto_apply_discount_code').maybeSingle();
      return (data?.setting_value as string) || '';
    },
  });
  const [code, setCode] = useState<string>('none');
  React.useEffect(() => { setCode(setting || 'none'); }, [setting]);

  const save = useMutation({
    mutationFn: async () => {
      const value = code === 'none' ? '' : code;
      const { error } = await supabase.from('admin_settings').upsert({
        setting_key: 'auto_apply_discount_code', setting_value: value, updated_at: new Date().toISOString(),
      } as any, { onConflict: 'setting_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Auto-apply discount updated');
      queryClient.invalidateQueries({ queryKey: ['auto-apply-discount'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activeCodes = (discounts || []).filter((d: any) => d.is_active);

  return (
    <GlassCard className="mb-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <Label className="mb-2 block">Auto-apply discount on article fees</Label>
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger><SelectValue placeholder="Select a code" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None — do not auto-apply</SelectItem>
              {activeCodes.map((d: any) => (
                <SelectItem key={d.id} value={d.code}>
                  {d.code} — {d.discount_type === 'percentage' ? `${d.discount_value}%` : d.discount_value} off ({d.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">This code will be applied automatically in author carts when they pay publication fees.</p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </div>
    </GlassCard>
  );
}

