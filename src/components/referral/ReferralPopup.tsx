import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { Gift, ArrowRight } from 'lucide-react';

export function ReferralPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const checkReferral = async () => {
      // Check if user already has a referral record (either as referrer or referred)
      const { data: existing } = await supabase
        .from('referrals')
        .select('id')
        .eq('referred_id', user.id)
        .maybeSingle();

      if (existing) return; // Already submitted a referral

      // Check if user has seen the popup (use localStorage)
      const key = `referral_popup_seen_${user.id}`;
      const dismissed = localStorage.getItem(`referral_popup_dismissed_${user.id}`);
      if (dismissed) return;

      const seen = localStorage.getItem(key);
      if (!seen) {
        setOpen(true);
      }
    };

    // Small delay to not show immediately on login
    const timeout = setTimeout(checkReferral, 1500);
    return () => clearTimeout(timeout);
  }, [user?.id]);

  const handleSubmit = async () => {
    if (!code.trim()) {
      handleSkip();
      return;
    }

    setLoading(true);
    try {
      // Look up the referrer by code
      const { data: referrer, error: lookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('referral_code', code.trim().toUpperCase())
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (!referrer) {
        toast({
          title: 'Invalid Code',
          description: 'The referral code you entered does not exist.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      if (referrer.id === user!.id) {
        toast({
          title: 'Invalid Code',
          description: 'You cannot use your own referral code.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Create referral record
      const { error: insertError } = await supabase
        .from('referrals')
        .insert({
          referrer_id: referrer.id,
          referred_id: user!.id,
          status: 'pending',
        });

      if (insertError) {
        if (insertError.code === '23505') {
          toast({
            title: 'Already Referred',
            description: 'You have already submitted a referral code.',
          });
        } else {
          throw insertError;
        }
      } else {
        toast({
          title: 'Referral Code Applied! 🎉',
          description: 'When your article gets published, your referrer will earn bonus downloads!',
        });
      }

      localStorage.setItem(`referral_popup_seen_${user!.id}`, 'true');
      setOpen(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (dontShowAgain) {
      localStorage.setItem(`referral_popup_dismissed_${user!.id}`, 'true');
    }
    localStorage.setItem(`referral_popup_seen_${user!.id}`, 'true');
    setOpen(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="glass-card-strong sm:max-w-md">
        <DialogHeader>
          <div className="w-16 h-16 rounded-full gradient-secondary flex items-center justify-center mx-auto mb-4">
            <Gift className="w-8 h-8 text-secondary-foreground" />
          </div>
          <DialogTitle className="font-display text-center text-xl">
            Have a Referral Code?
          </DialogTitle>
          <DialogDescription className="text-center">
            If someone referred you, enter their code below. When your article gets published, you'll both earn discount codes on publication fees!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <Input
            placeholder="Enter referral code (e.g. A1B2C3D4)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="glass-input text-center text-lg tracking-widest font-mono"
            maxLength={8}
          />

          <div className="flex items-center gap-2 mb-4">
            <Checkbox
              id="referral-dont-show"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <label htmlFor="referral-dont-show" className="text-xs text-muted-foreground cursor-pointer select-none">
              Don't show this again
            </label>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleSkip}
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 gradient-primary"
            >
              {loading ? 'Applying...' : 'Apply Code'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
