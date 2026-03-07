import React, { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

/**
 * Auto-detects rage clicks, unhandled errors, and UI hangs,
 * then submits a bug report automatically.
 */
export function BugReporter() {
  const { user } = useAuth();
  const clickTimestamps = useRef<number[]>([]);
  const reportedErrors = useRef<Set<string>>(new Set());

  const submitReport = useCallback(
    async (title: string, description: string, errorStack?: string, type = 'auto') => {
      if (!user) return;
      const key = title + (errorStack || '');
      if (reportedErrors.current.has(key)) return;
      reportedErrors.current.add(key);

      try {
        await supabase.from('bug_reports' as any).insert({
          user_id: user.id,
          type,
          title,
          description,
          page_url: window.location.href,
          user_agent: navigator.userAgent,
          error_stack: errorStack || null,
        } as any);
        toast({
          title: 'Bug reported automatically',
          description: 'Our team has been notified and will look into it.',
        });
      } catch {
        // silent fail
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) return;

    // Rage click detection (5+ clicks in 2 seconds on same area)
    const handleClick = () => {
      const now = Date.now();
      clickTimestamps.current.push(now);
      clickTimestamps.current = clickTimestamps.current.filter((t) => now - t < 2000);
      if (clickTimestamps.current.length >= 5) {
        clickTimestamps.current = [];
        submitReport(
          'Rage clicks detected',
          'User clicked rapidly 5+ times in 2 seconds — possible UI hang or unresponsive element.',
        );
      }
    };

    // Unhandled JS errors
    const handleError = (event: ErrorEvent) => {
      submitReport(
        `Unhandled error: ${event.message}`,
        `Error at ${event.filename}:${event.lineno}:${event.colno}`,
        event.error?.stack,
      );
    };

    // Unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason);
      submitReport('Unhandled promise rejection', msg, event.reason?.stack);
    };

    document.addEventListener('click', handleClick);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [user, submitReport]);

  return null;
}
