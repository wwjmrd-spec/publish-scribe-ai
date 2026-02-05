 import React, { useState } from 'react';
 import { motion } from 'framer-motion';
 import { DashboardLayout } from '@/components/layout/DashboardLayout';
 import { GlassCard } from '@/components/layout/GlassCard';
 import { Input } from '@/components/ui/input';
 import { 
   Users, 
   Search, 
   Mail,
   Building,
   Globe,
   FileText,
 } from 'lucide-react';
 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { GlassSpinner } from '@/components/ui/GlassSpinner';
 
 export default function AdminAuthors() {
   const [searchQuery, setSearchQuery] = useState('');
 
   const { data: authors, isLoading } = useQuery({
     queryKey: ['admin-authors'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('profiles')
         .select('*')
         .order('created_at', { ascending: false });
       
       if (error) throw error;
       return data;
     },
   });
 
   const { data: articleCounts } = useQuery({
     queryKey: ['admin-author-article-counts'],
     queryFn: async () => {
       const { data, error } = await supabase
         .from('articles')
         .select('author_id');
       
       if (error) throw error;
       
       const counts: Record<string, number> = {};
       data.forEach(article => {
         counts[article.author_id] = (counts[article.author_id] || 0) + 1;
       });
       return counts;
     },
   });
 
   const filteredAuthors = authors?.filter(author =>
     author.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     author.email.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
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
         <h1 className="font-display text-3xl font-bold mb-2">Manage Authors</h1>
         <p className="text-muted-foreground">View and manage registered authors</p>
       </motion.div>
 
       {/* Search */}
       <div className="relative mb-6">
         <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
         <Input
           placeholder="Search by name or email..."
           value={searchQuery}
           onChange={(e) => setSearchQuery(e.target.value)}
           className="pl-10 glass-input max-w-md"
         />
       </div>
 
       {/* Stats */}
       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
         <GlassCard>
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
               <Users className="w-5 h-5 text-primary" />
             </div>
             <div>
               <p className="text-2xl font-bold">{authors?.length || 0}</p>
               <p className="text-sm text-muted-foreground">Total Authors</p>
             </div>
           </div>
         </GlassCard>
         <GlassCard>
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
               <Globe className="w-5 h-5 text-green-500" />
             </div>
             <div>
               <p className="text-2xl font-bold">
                 {authors?.filter(a => !a.is_indian).length || 0}
               </p>
               <p className="text-sm text-muted-foreground">International</p>
             </div>
           </div>
         </GlassCard>
         <GlassCard>
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
               <Globe className="w-5 h-5 text-orange-500" />
             </div>
             <div>
               <p className="text-2xl font-bold">
                 {authors?.filter(a => a.is_indian).length || 0}
               </p>
               <p className="text-sm text-muted-foreground">Indian</p>
             </div>
           </div>
         </GlassCard>
       </div>
 
       {/* Authors Grid */}
       {!filteredAuthors?.length ? (
         <GlassCard>
           <div className="text-center py-12">
             <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
             <p className="text-muted-foreground">No authors found</p>
           </div>
         </GlassCard>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {filteredAuthors.map((author, index) => (
             <motion.div
               key={author.id}
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: index * 0.05 }}
             >
               <GlassCard className="h-full">
                 <div className="flex items-start gap-4">
                   <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-lg font-bold text-primary-foreground">
                     {author.full_name.charAt(0).toUpperCase()}
                   </div>
                   <div className="flex-1 min-w-0">
                     <h3 className="font-semibold truncate">{author.full_name}</h3>
                     <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                       <Mail className="w-3 h-3" />
                       <span className="truncate">{author.email}</span>
                     </div>
                     {author.affiliation && (
                       <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                         <Building className="w-3 h-3" />
                         <span className="truncate">{author.affiliation}</span>
                       </div>
                     )}
                     <div className="flex items-center justify-between mt-3">
                       <span className={`px-2 py-0.5 rounded-full text-xs ${
                         author.is_indian 
                           ? 'bg-orange-500/20 text-orange-400' 
                           : 'bg-green-500/20 text-green-400'
                       }`}>
                         {author.is_indian ? 'India' : author.country || 'International'}
                       </span>
                       <div className="flex items-center gap-1 text-sm text-muted-foreground">
                         <FileText className="w-3 h-3" />
                         {articleCounts?.[author.id] || 0} articles
                       </div>
                     </div>
                   </div>
                 </div>
               </GlassCard>
             </motion.div>
           ))}
         </div>
       )}
     </DashboardLayout>
   );
 }