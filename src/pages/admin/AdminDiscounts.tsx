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
type AppliesTo = 'article_fee' | 'pro_plan' | 'both';
type PositionLimit = 'first' | 'first_two' | 'any';

const APPLIES_TO_LABELS: Record<AppliesTo, string> = {
  article_fee: 'Article fees',
  pro_plan: 'Pro plan',
  both: 'Both',
};

const POSITION_LABELS: Record<PositionLimit, string> = {
  first: '1st article only',
  first_two: '1st & 2nd articles',
  any: 'Any article',
};

export default function AdminDiscounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'percentage' as DiscountType,
    discount_value: '',
    currency: 'BOTH' as DiscountCurrency,
    start_date: '',
    end_date: '',
    usage_limit: '',
    is_active: true,
    applies_to: 'both' as AppliesTo,
    article_position_limit: 'any' as PositionLimit,
    specific_article_ids: [] as string[],
    max_uses_per_user: '',
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
      const { error } = await supabase.from('discount_codes').insert({
        code: formData.code.toUpperCase(),
        discount_type: formData.discount_type,
        discount_value: parseFloat(formData.discount_value),
        currency: formData.currency,
        start_date: formData.start_date,
        end_date: formData.end_date,
        usage_limit: formData.usage_limit ? parseInt(formData.usage_limit) : null,
        is_active: formData.is_active,
        created_by: user?.id,
        applies_to: formData.applies_to,
        article_position_limit: formData.article_position_limit,
        specific_article_ids:
          formData.specific_article_ids.length > 0
            ? formData.specific_article_ids
            : null,
        max_uses_per_user: formData.max_uses_per_user
          ? parseInt(formData.max_uses_per_user)
          : null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      toast.success('Discount code created');
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('discount_codes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      toast.success('Discount code deleted');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('discount_codes')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
    },
  });

  const resetForm = () => {
    setFormData({
      code: '',
      discount_type: 'percentage',
      discount_value: '',
      currency: 'BOTH',
      start_date: '',
      end_date: '',
      usage_limit: '',
      is_active: true,
      applies_to: 'both',
      article_position_limit: 'any',
      specific_article_ids: [],
      max_uses_per_user: '',
    });
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
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 w-7 p-0" onClick={() => deleteMutation.mutate(discount.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                      {discount.discount_type === 'percentage' ? `${discount.discount_value}%` : `${discount.discount_value}`}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{discount.currency}</span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {APPLIES_TO_LABELS[(discount.applies_to as AppliesTo) || 'both']}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {POSITION_LABELS[(discount.article_position_limit as PositionLimit) || 'any']}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{discount.used_count || 0}/{discount.usage_limit || '∞'}</span>
                    {discount.max_uses_per_user && (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Max/user: {discount.max_uses_per_user}</span>
                    )}
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
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Position</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Validity</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Usage</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Max/User</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Active</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((discount) => (
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
                        {APPLIES_TO_LABELS[(discount.applies_to as AppliesTo) || 'both']}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {POSITION_LABELS[(discount.article_position_limit as PositionLimit) || 'any']}
                        {discount.specific_article_ids?.length ? (
                          <span className="ml-1 text-xs text-muted-foreground">({discount.specific_article_ids.length} specific)</span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(discount.start_date).toLocaleDateString()} - {new Date(discount.end_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">{discount.used_count || 0}/{discount.usage_limit || '∞'}</td>
                      <td className="py-3 px-4 text-sm">{discount.max_uses_per_user || '∞'}</td>
                      <td className="py-3 px-4">
                        <Switch checked={discount.is_active || false} onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: discount.id, is_active: checked })} />
                      </td>
                      <td className="py-3 px-4">
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(discount.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Applies To</Label>
                <Select
                  value={formData.applies_to}
                  onValueChange={(v) => setFormData({ ...formData, applies_to: v as AppliesTo })}
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="article_fee">Article fees</SelectItem>
                    <SelectItem value="pro_plan">Pro plan</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Article Position Limit</Label>
                <Select
                  value={formData.article_position_limit}
                  onValueChange={(v) => setFormData({ ...formData, article_position_limit: v as PositionLimit })}
                  disabled={formData.applies_to === 'pro_plan'}
                >
                  <SelectTrigger className="glass-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any article</SelectItem>
                    <SelectItem value="first">1st article only</SelectItem>
                    <SelectItem value="first_two">1st & 2nd articles</SelectItem>
                  </SelectContent>
                </Select>
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
                  Leave empty to apply to all eligible articles. Selected: {formData.specific_article_ids.length}
                </p>
                <ScrollArea className="h-40 rounded-md border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] p-2">
                  {!articles?.length ? (
                    <p className="text-xs text-muted-foreground p-2">No articles found.</p>
                  ) : (
                    <div className="space-y-1">
                      {articles.map((a) => (
                        <label
                          key={a.id}
                          className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-[hsl(var(--glass-bg))] cursor-pointer"
                        >
                          <Checkbox
                            checked={formData.specific_article_ids.includes(a.id)}
                            onCheckedChange={() => toggleArticleId(a.id)}
                          />
                          <span className="font-mono text-xs text-primary">{a.reference_number}</span>
                          <span className="truncate">{a.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label>Active immediately</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Create Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
