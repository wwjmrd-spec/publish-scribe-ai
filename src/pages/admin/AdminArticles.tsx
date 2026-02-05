 import React, { useState } from 'react';
 import { motion } from 'framer-motion';
 import { DashboardLayout } from '@/components/layout/DashboardLayout';
 import { GlassCard } from '@/components/layout/GlassCard';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { 
   FileText, 
   Search, 
   Eye,
   CheckCircle,
   XCircle,
   Clock,
   Filter,
 } from 'lucide-react';
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { GlassSpinner } from '@/components/ui/GlassSpinner';
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from '@/components/ui/select';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogDescription,
   DialogFooter,
 } from '@/components/ui/dialog';
 import { toast } from 'sonner';
 import type { Database } from '@/integrations/supabase/types';
 
 type ArticleStatus = Database['public']['Enums']['article_status'];
 
 export default function AdminArticles() {
   const [searchQuery, setSearchQuery] = useState('');
   const [statusFilter, setStatusFilter] = useState<string>('all');
   const [selectedArticle, setSelectedArticle] = useState<any>(null);
   const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
   const queryClient = useQueryClient();
 
   const { data: articles, isLoading } = useQuery({
     queryKey: ['admin-articles', statusFilter],
     queryFn: async () => {
       let query = supabase
         .from('articles')
         .select(`
           *,
           profiles:author_id (full_name, email)
         `)
         .order('created_at', { ascending: false });
       
       if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as ArticleStatus);
       }
       
       const { data, error } = await query;
       if (error) throw error;
       return data;
     },
   });
 
   const updateStatusMutation = useMutation({
     mutationFn: async ({ articleId, status }: { articleId: string; status: ArticleStatus }) => {
       const { error } = await supabase
         .from('articles')
         .update({ status })
         .eq('id', articleId);
       
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
       toast.success('Article status updated');
       setIsViewDialogOpen(false);
     },
     onError: (error) => {
       toast.error('Failed to update status: ' + error.message);
     },
   });
 
   const filteredArticles = articles?.filter(article =>
     article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
     article.reference_number.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
   const getStatusBadge = (status: string) => {
     const styles: Record<string, string> = {
       submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
       under_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
       pending_fee: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
       paid: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
       published: 'bg-green-500/20 text-green-400 border-green-500/30',
       rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
     };
     return styles[status] || 'bg-muted text-muted-foreground';
   };
 
   const formatStatus = (status: string) => {
     return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
         className="mb-8"
       >
         <h1 className="font-display text-3xl font-bold mb-2">Manage Articles</h1>
         <p className="text-muted-foreground">Review and manage article submissions</p>
       </motion.div>
 
       {/* Filters */}
       <div className="flex flex-col sm:flex-row gap-4 mb-6">
         <div className="relative flex-1">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
           <Input
             placeholder="Search by title or reference..."
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="pl-10 glass-input"
           />
         </div>
         <Select value={statusFilter} onValueChange={setStatusFilter}>
           <SelectTrigger className="w-full sm:w-48 glass-input">
             <Filter className="w-4 h-4 mr-2" />
             <SelectValue placeholder="Filter by status" />
           </SelectTrigger>
           <SelectContent>
             <SelectItem value="all">All Status</SelectItem>
             <SelectItem value="submitted">Submitted</SelectItem>
             <SelectItem value="under_review">Under Review</SelectItem>
             <SelectItem value="pending_fee">Pending Fee</SelectItem>
             <SelectItem value="paid">Paid</SelectItem>
             <SelectItem value="published">Published</SelectItem>
             <SelectItem value="rejected">Rejected</SelectItem>
           </SelectContent>
         </Select>
       </div>
 
       {/* Articles Table */}
       <GlassCard>
         {!filteredArticles?.length ? (
           <div className="text-center py-12">
             <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
             <p className="text-muted-foreground">No articles found</p>
           </div>
         ) : (
           <div className="overflow-x-auto">
             <table className="w-full">
               <thead>
                 <tr className="border-b border-[hsl(var(--glass-border))]">
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Reference</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Title</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Author</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                   <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                 </tr>
               </thead>
               <tbody>
                 {filteredArticles.map((article) => (
                   <tr key={article.id} className="border-b border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--glass-bg))] transition-colors">
                     <td className="py-3 px-4 font-mono text-sm">{article.reference_number}</td>
                     <td className="py-3 px-4 max-w-[200px] truncate">{article.title}</td>
                     <td className="py-3 px-4 text-sm">
                       {(article.profiles as any)?.full_name || 'Unknown'}
                     </td>
                     <td className="py-3 px-4">
                       <span className={`px-2 py-1 rounded-full text-xs border ${getStatusBadge(article.status || '')}`}>
                         {formatStatus(article.status || '')}
                       </span>
                     </td>
                     <td className="py-3 px-4 text-sm text-muted-foreground">
                       {new Date(article.created_at || '').toLocaleDateString()}
                     </td>
                     <td className="py-3 px-4">
                       <Button
                         size="sm"
                         variant="ghost"
                         onClick={() => {
                           setSelectedArticle(article);
                           setIsViewDialogOpen(true);
                         }}
                       >
                         <Eye className="w-4 h-4" />
                       </Button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         )}
       </GlassCard>
 
       {/* View/Edit Dialog */}
       <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
         <DialogContent className="glass-card-strong max-w-2xl">
           <DialogHeader>
             <DialogTitle className="gradient-text">{selectedArticle?.title}</DialogTitle>
             <DialogDescription>Reference: {selectedArticle?.reference_number}</DialogDescription>
           </DialogHeader>
           
           {selectedArticle && (
             <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-sm text-muted-foreground">Author</label>
                   <p className="font-medium">{(selectedArticle.profiles as any)?.full_name}</p>
                   <p className="text-sm text-muted-foreground">{(selectedArticle.profiles as any)?.email}</p>
                 </div>
                 <div>
                   <label className="text-sm text-muted-foreground">Current Status</label>
                   <p className={`inline-block px-2 py-1 rounded-full text-xs border mt-1 ${getStatusBadge(selectedArticle.status)}`}>
                     {formatStatus(selectedArticle.status)}
                   </p>
                 </div>
               </div>
               
               {selectedArticle.abstract && (
                 <div>
                   <label className="text-sm text-muted-foreground">Abstract</label>
                   <p className="text-sm mt-1 p-3 rounded-lg bg-[hsl(var(--glass-bg))]">{selectedArticle.abstract}</p>
                 </div>
               )}
 
               {selectedArticle.keywords?.length > 0 && (
                 <div>
                   <label className="text-sm text-muted-foreground">Keywords</label>
                   <div className="flex flex-wrap gap-2 mt-1">
                     {selectedArticle.keywords.map((keyword: string, i: number) => (
                       <span key={i} className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs">
                         {keyword}
                       </span>
                     ))}
                   </div>
                 </div>
               )}
 
               {selectedArticle.document_url && (
                 <div>
                   <a
                     href={selectedArticle.document_url}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="inline-flex items-center gap-2 text-primary hover:underline"
                   >
                     <FileText className="w-4 h-4" />
                     View Document
                   </a>
                 </div>
               )}
             </div>
           )}
 
           <DialogFooter className="flex-wrap gap-2">
             <Button
               variant="outline"
               onClick={() => updateStatusMutation.mutate({ articleId: selectedArticle.id, status: 'under_review' })}
               disabled={updateStatusMutation.isPending}
             >
               <Clock className="w-4 h-4 mr-2" />
               Mark Under Review
             </Button>
             <Button
               variant="outline"
               className="text-orange-400 hover:text-orange-300"
               onClick={() => updateStatusMutation.mutate({ articleId: selectedArticle.id, status: 'pending_fee' })}
               disabled={updateStatusMutation.isPending}
             >
               Pending Fee
             </Button>
             <Button
               variant="outline"
               className="text-green-400 hover:text-green-300"
               onClick={() => updateStatusMutation.mutate({ articleId: selectedArticle.id, status: 'published' })}
               disabled={updateStatusMutation.isPending}
             >
               <CheckCircle className="w-4 h-4 mr-2" />
               Publish
             </Button>
             <Button
               variant="outline"
               className="text-destructive hover:text-destructive"
               onClick={() => updateStatusMutation.mutate({ articleId: selectedArticle.id, status: 'rejected' })}
               disabled={updateStatusMutation.isPending}
             >
               <XCircle className="w-4 h-4 mr-2" />
               Reject
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </DashboardLayout>
   );
 }