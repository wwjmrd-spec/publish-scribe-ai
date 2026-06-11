import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from '@/components/layout/PageLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, MapPin, Phone, Mail, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

function ContactBody() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', subject: '', phone: '', message: '' });
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.subject || !form.message) {
      toast({ title: 'Please fill the required fields', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const html = `<h2>New contact message</h2>
        <p><strong>Name:</strong> ${form.name}</p>
        <p><strong>Email:</strong> ${form.email}</p>
        <p><strong>Phone:</strong> ${form.phone || '-'}</p>
        <p><strong>Subject:</strong> ${form.subject}</p>
        <p><strong>Message:</strong></p><p>${form.message.replace(/\n/g, '<br/>')}</p>`;
      const { data: setting } = await supabase
        .from('admin_settings').select('setting_value')
        .eq('setting_key', 'admin_notification_email').maybeSingle();
      const to = (setting?.setting_value as string) || 'wwjmrd@gmail.com';
      await supabase.functions.invoke('send-email', {
        body: { to, template: 'custom', subject: `Contact: ${form.subject}`, html, replyTo: form.email },
      });
      toast({ title: 'Message sent', description: 'Thanks — we will get back to you shortly.' });
      setForm({ name: '', email: '', subject: '', phone: '', message: '' });
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err?.message || 'Try again later', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <GlassCard>
        <h2 className="font-display text-xl font-semibold mb-4">Reach Us</h2>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3"><MapPin className="w-4 h-4 mt-0.5 text-primary" /> B-103, Vijay Vihar, Delhi -110085, India</li>
          <li className="flex gap-3"><Phone className="w-4 h-4 mt-0.5 text-primary" /> +91 9999 669 429</li>
          <li className="flex gap-3"><Mail className="w-4 h-4 mt-0.5 text-primary" /> wwjmrd@gmail.com</li>
        </ul>
        <div className="mt-6 rounded-lg overflow-hidden border border-[hsl(var(--glass-border))]">
          <iframe
            title="Location"
            src="https://www.google.com/maps?q=B-103,+Vijay+Vihar,+Delhi+110085&output=embed"
            className="w-full h-64"
            loading="lazy"
          />
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display text-xl font-semibold mb-4">Interested in discussing?</h2>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="glass-input" /></div>
          <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="glass-input" /></div>
          <div><Label>Subject *</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="glass-input" /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="glass-input" /></div>
          <div><Label>Message *</Label><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="glass-input" /></div>
          <Button type="submit" disabled={sending} className="gradient-primary w-full">
            <Send className="w-4 h-4 mr-2" /> {sending ? 'Sending…' : 'Send message'}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}

export default function Contact() {
  const { user } = useAuth();
  if (user) {
    return (
      <DashboardLayout type="author">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-display text-3xl font-bold mb-6 gradient-text">Contact Us</h1>
          <ContactBody />
        </div>
      </DashboardLayout>
    );
  }
  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-16 pt-28 max-w-5xl">
        <Link to="/"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" /> Home</Button></Link>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-6 gradient-text">Contact Us</h1>
        <ContactBody />
      </div>
    </PageLayout>
  );
}
