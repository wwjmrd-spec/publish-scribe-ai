import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { joinName, splitName } from '@/lib/nameParts';

export function CountryCollectionModal() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [needsCountry, setNeedsCountry] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authLoading || !user || checked) return;

    const checkProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('country, first_name, last_name, full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (!data) { setChecked(true); return; }

      const meta: any = (user as any).user_metadata || {};
      // Try to extract the name from the identity provider (Google) first.
      const metaFirst = (meta.given_name || meta.first_name || '').toString().trim();
      const metaLast = (meta.family_name || meta.last_name || '').toString().trim();
      const metaFull = (meta.full_name || meta.name || '').toString().trim();
      const fromFull = splitName(metaFull || data.full_name || '');

      const resolvedFirst = (data.first_name || metaFirst || fromFull.firstName || '').trim();
      const resolvedLast = (data.last_name || metaLast || fromFull.lastName || '').trim();

      const countryMissing = !data.country || data.country === 'Unknown' || data.country.trim() === '';
      const nameMissing = !resolvedFirst || !resolvedLast;

      // Silently backfill first/last name when the provider gave us enough.
      if (!nameMissing && (!data.first_name || !data.last_name)) {
        await supabase
          .from('profiles')
          .update({
            first_name: resolvedFirst,
            last_name: resolvedLast,
            full_name: data.full_name || joinName(resolvedFirst, resolvedLast),
          })
          .eq('id', user.id);
      }

      setFirstName(resolvedFirst);
      setLastName(resolvedLast);
      setNeedsName(nameMissing);
      setNeedsCountry(countryMissing);

      if (countryMissing) {
        try {
          const response = await fetch('https://ipapi.co/json/');
          const ipData = await response.json();
          if (ipData.country_name) setCountry(ipData.country_name);
        } catch {}
      }

      if (countryMissing || nameMissing) setOpen(true);
      setChecked(true);
    };

    checkProfile();
  }, [user, authLoading, checked]);

  const handleSave = async () => {
    if (needsCountry && (!country.trim() || country.trim().length < 2)) {
      toast({ title: 'Please enter a valid country', variant: 'destructive' });
      return;
    }
    if (needsName && (!firstName.trim() || !lastName.trim())) {
      toast({ title: 'Please enter your first and last name', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const update: Record<string, any> = {};
      if (needsCountry) {
        update.country = country.trim();
        update.is_indian = country.trim().toLowerCase() === 'india';
      }
      if (needsName) {
        update.first_name = firstName.trim();
        update.last_name = lastName.trim();
        update.full_name = joinName(firstName.trim(), lastName.trim());
      }

      const { error } = await supabase.from('profiles').update(update as any).eq('id', user.id);
      if (error) throw error;

      toast({ title: 'Profile updated successfully!' });
      setOpen(false);
      window.location.reload();
    } catch (err: any) {
      toast({ title: 'Failed to save details', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const disabled =
    saving ||
    (needsCountry && !country.trim()) ||
    (needsName && (!firstName.trim() || !lastName.trim()));

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md z-[999999]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Complete Your Profile
          </DialogTitle>
          <DialogDescription>
            We need a few details to continue. This helps us credit your name correctly and
            determine the right publication fees and currency.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {needsName && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="modal-first-name">First Name *</Label>
                <Input
                  id="modal-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modal-last-name">Last Name *</Label>
                <Input
                  id="modal-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="h-11"
                />
              </div>
            </div>
          )}
          {needsCountry && (
            <div className="space-y-2">
              <Label htmlFor="modal-country">Country *</Label>
              <Input
                id="modal-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g., India, United States"
                className="h-11"
              />
            </div>
          )}
          <Button onClick={handleSave} disabled={disabled} className="w-full gradient-primary">
            {saving ? <GlassSpinner size="sm" /> : 'Save & Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
