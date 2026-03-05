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

export function CountryCollectionModal() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState('');
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authLoading || !user || checked) return;

    const checkCountry = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('country')
        .eq('id', user.id)
        .maybeSingle();

      if (data && (!data.country || data.country === 'Unknown' || data.country.trim() === '')) {
        // Try to auto-detect
        try {
          const response = await fetch('https://ipapi.co/json/');
          const ipData = await response.json();
          if (ipData.country_name) setCountry(ipData.country_name);
        } catch {}
        setOpen(true);
      }
      setChecked(true);
    };

    checkCountry();
  }, [user, authLoading, checked]);

  const handleSave = async () => {
    if (!country.trim() || country.trim().length < 2) {
      toast({ title: 'Please enter a valid country', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const isIndian = country.trim().toLowerCase() === 'india';
      const { error } = await supabase
        .from('profiles')
        .update({ country: country.trim(), is_indian: isIndian })
        .eq('id', user.id);

      if (error) throw error;

      toast({ title: 'Country saved successfully!' });
      setOpen(false);
      // Reload to update auth context
      window.location.reload();
    } catch (err: any) {
      toast({ title: 'Failed to save country', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md z-[999999]" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            Complete Your Profile
          </DialogTitle>
          <DialogDescription>
            Please enter your country to continue. This helps us determine the correct publication fees and currency.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
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
          <Button
            onClick={handleSave}
            disabled={saving || !country.trim()}
            className="w-full gradient-primary"
          >
            {saving ? <GlassSpinner size="sm" /> : 'Save & Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
