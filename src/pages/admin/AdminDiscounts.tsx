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
 import { toast } from 'sonner';
 import { useAuth } from '@/contexts/AuthContext';
 import type { Database } from '@/integrations/supabase/types';
 
 type DiscountType = Database['public']['Enums']['discount_type'];
 type DiscountCurrency = Database['public']['Enums']['discount_currency'];
 
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
       const { error } = await supabase
         .from('discount_codes')
         .delete()
         .eq('id', id);
       
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
     });
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
         className="mb-8 flex items-center justify-between"
       >
         <div>
           <h1 className="font-display text-3xl font-bold mb-2">Discount Codes</h1>
           <p className="text-muted-foreground">Create and manage promotional codes</p>
         </div>
         <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
           <Plus className="w-4 h-4" />
           Create Code
         </Button>
       </motion.div>
 
       {/* Discounts Table */}
       <GlassCard>
         {!discounts?.length ? (
           <div className="text-center py-12">
             <Tag className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
             <p className="text-muted-foreground">No discount codes yet</p>
             <Button 
               variant="outline" 
               className="mt-4"
               onClick={() => setIsCreateDialogOpen(true)}
             >
               Create your first code
             </Button>
           </div>
         ) : (
           <div className="overflow-x-auto">
             <table className="w-full">
               <thead>
                 <tr className="border-b border-[hsl(var(--glass-border))]">
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Code</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Discount</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Currency</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Validity</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Usage</th>
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
                     <td className="py-3 px-4 text-sm text-muted-foreground">
                       <div className="flex items-center gap-1">
                         <Calendar className="w-3 h-3" />
                         {new Date(discount.start_date).toLocaleDateString()} - {new Date(discount.end_date).toLocaleDateString()}
                       </div>
                     </td>
                     <td className="py-3 px-4 text-sm">
                       {discount.used_count || 0}/{discount.usage_limit || '∞'}
                     </td>
                     <td className="py-3 px-4">
                       <Switch
                         checked={discount.is_active || false}
                         onCheckedChange={(checked) => 
                           toggleActiveMutation.mutate({ id: discount.id, is_active: checked })
                         }
                       />
                     </td>
                     <td className="py-3 px-4">
                       <Button
                         size="sm"
                         variant="ghost"
                         className="text-destructive hover:text-destructive"
                         onClick={() => deleteMutation.mutate(discount.id)}
                       >
                         <Trash2 className="w-4 h-4" />
                       </Button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         )}
       </GlassCard>
 
       {/* Create Dialog */}
       <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
         <DialogContent className="glass-card-strong">
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
                 <Label>Value</Label>
                 <Input
                   type="number"
                   placeholder={formData.discount_type === 'percentage' ? '10' : '100'}
                   value={formData.discount_value}
                   onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                   className="glass-input"
                 />
               </div>
             </div>
 
             <div>
               <Label>Applies To</Label>
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
                 </SelectContent>
               </Select>
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
 
             <div>
               <Label>Usage Limit (optional)</Label>
               <Input
                 type="number"
                 placeholder="Unlimited"
                 value={formData.usage_limit}
                 onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                 className="glass-input"
               />
             </div>
 
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