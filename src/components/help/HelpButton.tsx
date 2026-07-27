import React, { useState } from 'react';
import { HelpCircle, X, Send, MessageSquare, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SupportChat } from './SupportChat';

export function HelpButton() {
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'message'>('chat');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast({ title: 'Please fill subject and message', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const { error } = await (supabase as any).from('contact_questions').insert({
        name: (profile?.full_name || user?.email || 'Author').slice(0, 100),
        email: (user?.email || '').slice(0, 200),
        subject: subject.trim().slice(0, 200),
        message: message.trim().slice(0, 4000),
        user_agent: navigator.userAgent.slice(0, 500),
      });
      if (error) throw error;
      toast({ title: 'Message sent', description: 'Our team will get back to you shortly.' });
      setSubject('');
      setMessage('');
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err?.message || 'Try again later', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Help"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full gradient-primary text-primary-foreground px-4 py-3 shadow-lg hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)] transition-all"
      >
        <HelpCircle className="w-5 h-5" />
        <span className="hidden sm:inline text-sm font-medium">Help</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold">WWJMRD Support</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-full hover:bg-[hsl(var(--glass-bg))]"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1 p-1 mb-4 rounded-lg bg-[hsl(var(--glass-bg))]">
              <button
                onClick={() => setTab('chat')}
                className={`flex-1 flex items-center justify-center gap-2 text-sm py-1.5 rounded-md transition-colors ${tab === 'chat' ? 'bg-[hsl(var(--card))] shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                <Bot className="w-4 h-4" /> Ask the Assistant
              </button>
              <button
                onClick={() => setTab('message')}
                className={`flex-1 flex items-center justify-center gap-2 text-sm py-1.5 rounded-md transition-colors ${tab === 'message' ? 'bg-[hsl(var(--card))] shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                <MessageSquare className="w-4 h-4" /> Message Support
              </button>
            </div>

            {tab === 'chat' ? (
              <SupportChat />
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Send us your question and our team will reply by email.
                </p>
                <form onSubmit={submit} className="space-y-3">
                  <div>
                    <Label>Subject *</Label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="glass-input"
                      placeholder="What do you need help with?"
                    />
                  </div>
                  <div>
                    <Label>Message *</Label>
                    <Textarea
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="glass-input"
                      placeholder="Describe your issue…"
                    />
                  </div>
                  <Button type="submit" disabled={sending} className="gradient-primary w-full">
                    <Send className="w-4 h-4 mr-2" />
                    {sending ? 'Sending…' : 'Send Message'}
                  </Button>
                </form>
              </>
            )}
          </div>

        </div>
      )}
    </>
  );
}
