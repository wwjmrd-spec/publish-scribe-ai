import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import { Mail, Save, RotateCcw, Eye, Code } from 'lucide-react';

// Built-in template keys + default subjects (rendered HTML preview comes from a sample call).
const TEMPLATES: { key: string; label: string; defaultSubject: string; sampleHtml: string }[] = [
  { key: 'password-reset', label: 'Password Reset', defaultSubject: 'Reset Your Password - WWJMRD', sampleHtml: '<h1>Reset your password</h1><p>Hi {{userName}}, click the link below to reset.</p><p><a href="{{resetUrl}}">Reset password</a></p>' },
  { key: 'email-verification', label: 'Email Verification', defaultSubject: 'Verify Your Email - WWJMRD', sampleHtml: '<h1>Verify your email</h1><p>Hi {{userName}}, please confirm your address.</p><p><a href="{{verifyUrl}}">Verify</a></p>' },
  { key: 'welcome', label: 'Welcome', defaultSubject: 'Welcome to WWJMRD! 🎉', sampleHtml: '<h1>Welcome, {{userName}}!</h1><p>Get started: <a href="{{loginUrl}}">Sign in</a></p>' },
  { key: 'article-submission', label: 'Article Submission', defaultSubject: 'Article Submitted Successfully - WWJMRD', sampleHtml: '<h1>Article submitted</h1><p>"{{articleTitle}}" — Reference {{referenceNumber}}</p>' },
  { key: 'article-resubmission', label: 'Article Resubmission', defaultSubject: 'Article Resubmitted Successfully - WWJMRD', sampleHtml: '<h1>Article resubmitted</h1><p>"{{articleTitle}}" — Reference {{referenceNumber}}</p>' },
  { key: 'payment-confirmation', label: 'Payment Confirmation', defaultSubject: 'Payment Successful - WWJMRD', sampleHtml: '<h1>Payment received</h1><p>Thank you {{authorName}}.</p>' },
  { key: 'referral-reward', label: 'Referral Reward', defaultSubject: 'Referral Reward Earned! 🎉 - WWJMRD', sampleHtml: '<h1>Referral reward</h1><p>Code: <strong>{{discountCode}}</strong></p>' },
  { key: 'article-status-change', label: 'Article Status Change', defaultSubject: 'Article Status Update - WWJMRD', sampleHtml: '<h1>Status update</h1><p>"{{articleTitle}}" is now {{status}}.</p>' },
  { key: 'review-report-ready', label: 'Review Report Ready', defaultSubject: 'Review Report Ready - WWJMRD', sampleHtml: '<h1>Review report ready</h1><p>Your review report for "{{articleTitle}}" is ready.</p>' },
  { key: 'payment-reminder', label: 'Payment Reminder', defaultSubject: 'Payment Reminder - WWJMRD', sampleHtml: '<h1>Payment reminder</h1><p>Hi {{authorName}}, your article "{{articleTitle}}" ({{referenceNumber}}) is awaiting payment.{{extraMessage}}</p>' },
  { key: 'galley-proof-review', label: 'Galley Proof Review', defaultSubject: 'Galley Proof Ready - WWJMRD', sampleHtml: '<h1>Galley proof ready</h1><p>Please review the galley proof for "{{articleTitle}}".</p>' },
  { key: 'copyright-form-request', label: 'Copyright Form Request', defaultSubject: 'Copyright Form Required - WWJMRD', sampleHtml: '<h1>Copyright form needed</h1><p>Sign the copyright form for "{{articleTitle}}".</p>' },
  { key: 'upgrade-to-pro', label: 'Upgrade to Pro', defaultSubject: 'Upgrade to Pro Plan - WWJMRD', sampleHtml: '<h1>Upgrade to Pro</h1><p>Unlock more benefits.</p>' },
  { key: 'manuscript-revise', label: 'Manuscript Revise', defaultSubject: 'Manuscript Revision Required - WWJMRD', sampleHtml: '<h1>Revision required</h1><p>Please revise "{{articleTitle}}".</p>' },
  { key: 'manuscript-update', label: 'Manuscript Update', defaultSubject: 'Manuscript Updated Successfully - WWJMRD', sampleHtml: '<h1>Manuscript updated</h1><p>"{{articleTitle}}"</p>' },
  { key: 'galley-proof-revision', label: 'Galley Proof Revision', defaultSubject: 'Galley Proof Revision Submitted - WWJMRD', sampleHtml: '<h1>Galley proof revision</h1><p>"{{articleTitle}}"</p>' },
  { key: 'galley-proof-approved', label: 'Galley Proof Approved', defaultSubject: 'Galley Proof Approval Received - WWJMRD', sampleHtml: '<h1>Galley proof approved</h1><p>"{{articleTitle}}"</p>' },
  { key: 'article-published', label: 'Article Published', defaultSubject: '🎉 Your Article is Published! - WWJMRD', sampleHtml: '<h1>Published!</h1><p>"{{articleTitle}}" ({{referenceNumber}}) is live.</p>' },
  { key: 'admin-created-credentials', label: 'Admin-Created Credentials', defaultSubject: 'Your WWJMRD account is ready 🎉', sampleHtml: '<h1>Your account is ready</h1><p>Email: {{email}}</p><p>Temporary password: {{password}}</p>' },
  { key: 'galley-proof-author-corrections', label: 'Galley Proof Author Corrections', defaultSubject: 'Author Corrections Received - WWJMRD', sampleHtml: '<h1>Corrections received</h1><p>"{{articleTitle}}"</p>' },
];

export default function AdminEmailTemplates() {
  const queryClient = useQueryClient();
  const [activeKey, setActiveKey] = useState<string>(TEMPLATES[0].key);
  const tpl = TEMPLATES.find(t => t.key === activeKey)!;
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['email-template-overrides'],
    queryFn: async () => {
      const { data, error } = await supabase.from('email_templates' as any).select('*');
      if (error) throw error;
      const map: Record<string, { subject: string; html: string }> = {};
      (data || []).forEach((r: any) => { map[r.template_key] = { subject: r.subject, html: r.html }; });
      return map;
    },
  });

  React.useEffect(() => {
    const o = overrides?.[activeKey];
    setSubject(o?.subject ?? tpl.defaultSubject);
    setHtml(o?.html ?? tpl.sampleHtml);
  }, [activeKey, overrides]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('email_templates' as any).upsert({
        template_key: activeKey, subject, html, updated_at: new Date().toISOString(),
      } as any, { onConflict: 'template_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Template saved');
      queryClient.invalidateQueries({ queryKey: ['email-template-overrides'] });
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('email_templates' as any).delete().eq('template_key', activeKey);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Reverted to built-in template');
      queryClient.invalidateQueries({ queryKey: ['email-template-overrides'] });
    },
    onError: (e: any) => toast.error('Failed: ' + e.message),
  });

  const isOverridden = !!overrides?.[activeKey];

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2 flex items-center gap-2"><Mail className="w-7 h-7" /> Email Templates</h1>
          <p className="text-muted-foreground">Edit the subject and HTML of any transactional email. Use <code>{'{{tokens}}'}</code> for dynamic values like <code>{'{{authorName}}'}</code>, <code>{'{{articleTitle}}'}</code>.</p>
        </div>

        {isLoading ? <GlassSpinner size="lg" /> : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <GlassCard className="lg:max-h-[70vh] overflow-y-auto">
              <Label className="mb-2 block">Template</Label>
              <Select value={activeKey} onValueChange={setActiveKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}{overrides?.[t.key] ? ' •' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="mt-4 space-y-1 hidden lg:block">
                {TEMPLATES.map(t => (
                  <button key={t.key} onClick={() => setActiveKey(t.key)} className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${activeKey === t.key ? 'bg-primary/20 text-primary' : 'hover:bg-[hsl(var(--glass-bg))]'}`}>
                    {t.label} {overrides?.[t.key] && <span className="text-xs text-primary">• edited</span>}
                  </button>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <div className="space-y-4">
                <div>
                  <Label>Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>

                <Tabs defaultValue="editor">
                  <TabsList>
                    <TabsTrigger value="editor"><Code className="w-4 h-4 mr-2" /> HTML editor</TabsTrigger>
                    <TabsTrigger value="preview"><Eye className="w-4 h-4 mr-2" /> Preview</TabsTrigger>
                  </TabsList>
                  <TabsContent value="editor">
                    <Textarea value={html} onChange={(e) => setHtml(e.target.value)} className="font-mono text-xs min-h-[420px]" />
                  </TabsContent>
                  <TabsContent value="preview">
                    <div className="rounded-md border border-[hsl(var(--glass-border))] bg-white text-black min-h-[420px] overflow-auto">
                      <iframe title="preview" srcDoc={html} className="w-full min-h-[420px] bg-white" />
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" /> {saveMutation.isPending ? 'Saving…' : 'Save template'}
                  </Button>
                  {isOverridden && (
                    <Button variant="outline" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
                      <RotateCcw className="w-4 h-4 mr-2" /> Revert to built-in
                    </Button>
                  )}
                </div>
              </div>
            </GlassCard>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
