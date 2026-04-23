import React, { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface PendingReport {
  type: string;
  title: string;
  description: string;
  errorStack: string;
}

/**
 * Auto-detects rage clicks, unhandled errors, and UI hangs.
 * Opens a dialog for user to confirm/edit before submitting.
 * Also exposes a floating "Report a bug" button for manual reports.
 */
export function BugReporter() {
  const { user } = useAuth();
  const clickTimestamps = useRef<number[]>([]);
  const reportedErrors = useRef<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<PendingReport>({
    type: 'manual',
    title: '',
    description: '',
    errorStack: '',
  });

  const openDialog = useCallback((next: PendingReport) => {
    if (!user) return;
    const key = next.title + (next.errorStack || '');
    if (reportedErrors.current.has(key)) return;
    reportedErrors.current.add(key);
    setReport(next);
    setOpen(true);
  }, [user]);

  const submitReport = async () => {
    if (!user) return;
    if (!report.title.trim()) {
      toast({ title: 'Title required', description: 'Please describe the issue briefly.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await supabase.from('bug_reports' as any).insert({
        user_id: user.id,
        type: report.type,
        title: report.title.trim(),
        description: report.description.trim() || null,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        error_stack: report.errorStack.trim() || null,
      } as any);
      toast({
        title: 'Bug report sent',
        description: 'Thanks — our team has been notified and will look into it.',
      });
      setOpen(false);
    } catch {
      toast({
        title: 'Could not send report',
        description: 'Email us at support@wwjmrd.com or WhatsApp +91 9999669429 for help.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const handleClick = () => {
      const now = Date.now();
      clickTimestamps.current.push(now);
      clickTimestamps.current = clickTimestamps.current.filter((t) => now - t < 2000);
      if (clickTimestamps.current.length >= 5) {
        clickTimestamps.current = [];
        openDialog({
          type: 'rage_click',
          title: 'Rage clicks detected',
          description: 'I clicked rapidly because something seemed unresponsive.',
          errorStack: '',
        });
      }
    };

    const handleError = (event: ErrorEvent) => {
      openDialog({
        type: 'js_error',
        title: `Unhandled error: ${event.message}`.slice(0, 200),
        description: `Error at ${event.filename}:${event.lineno}:${event.colno}`,
        errorStack: event.error?.stack || '',
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason);
      openDialog({
        type: 'promise_rejection',
        title: 'Unhandled promise rejection',
        description: msg.slice(0, 500),
        errorStack: event.reason?.stack || '',
      });
    };

    document.addEventListener('click', handleClick);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [user, openDialog]);

  if (!user) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass-card-strong max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-primary" /> Report an issue
            </DialogTitle>
            <DialogDescription>
              Review the details below and edit anything you'd like to change before submitting.
              Need help right away? Email{' '}
              <a href="mailto:support@wwjmrd.com" className="text-primary underline">support@wwjmrd.com</a>{' '}
              or WhatsApp <span className="font-medium">+91 9999669429</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="bug-title">Title</Label>
              <Input
                id="bug-title"
                value={report.title}
                onChange={(e) => setReport({ ...report, title: e.target.value })}
                placeholder="What went wrong?"
                className="glass-input"
              />
            </div>
            <div>
              <Label htmlFor="bug-desc">Description</Label>
              <Textarea
                id="bug-desc"
                value={report.description}
                onChange={(e) => setReport({ ...report, description: e.target.value })}
                placeholder="Steps to reproduce, what you expected, what happened..."
                className="glass-input min-h-[100px]"
              />
            </div>
            <div>
              <Label htmlFor="bug-stack">Error details (optional)</Label>
              <Textarea
                id="bug-stack"
                value={report.errorStack}
                onChange={(e) => setReport({ ...report, errorStack: e.target.value })}
                placeholder="Error stack trace or technical details (auto-filled when available)"
                className="glass-input font-mono text-xs min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitReport} disabled={submitting || !report.title.trim()}>
              {submitting ? 'Sending...' : 'Send report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
