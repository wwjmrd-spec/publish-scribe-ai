import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export const DISCOVERY_OPTIONS = [
  { value: 'google_search', label: 'Google Search', icon: '🔍' },
  { value: 'friend_colleague', label: 'Referred by Friend or Colleague', icon: '👥' },
  { value: 'social_media', label: 'Social Media', icon: '📱' },
  { value: 'email', label: 'Email', icon: '✉️' },
];

export function formatDiscoverySource(source?: string | null) {
  const opt = DISCOVERY_OPTIONS.find((o) => o.value === source);
  return opt ? `${opt.icon} ${opt.label}` : source || '—';
}

export function formatDiscoveryDetails(details?: any): string | null {
  if (!details || typeof details !== 'object') return null;
  const parts: string[] = [];
  if (details.platform) parts.push(`Platform: ${details.platform}`);
  if (details.keyword) parts.push(`Keyword: ${details.keyword}`);
  if (details.referrer_name) parts.push(`Referred by: ${details.referrer_name}`);
  if (details.referrer_email) parts.push(`Referrer email: ${details.referrer_email}`);
  if (details.email_subject) parts.push(`Email subject: ${details.email_subject}`);
  return parts.length ? parts.join(' · ') : null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiscoverySourceDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [source, setSource] = React.useState('');
  const [platform, setPlatform] = React.useState('');
  const [platformOther, setPlatformOther] = React.useState('');
  const [keyword, setKeyword] = React.useState('');
  const [referrerName, setReferrerName] = React.useState('');
  const [referrerEmail, setReferrerEmail] = React.useState('');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const buildDetails = () => {
    if (source === 'social_media') {
      return { platform: platform === 'other' ? platformOther.trim() : platform };
    }
    if (source === 'google_search') return { keyword: keyword.trim() };
    if (source === 'friend_colleague')
      return { referrer_name: referrerName.trim(), referrer_email: referrerEmail.trim() };
    if (source === 'email') return { email_subject: emailSubject.trim() };
    return null;
  };

  const validate = () => {
    if (!source) return 'Please tell us how you heard about us';
    if (source === 'social_media') {
      if (!platform) return 'Please select the social media platform';
      if (platform === 'other' && !platformOther.trim()) return 'Please type the social media platform';
    }
    if (source === 'google_search' && !keyword.trim()) return 'Please enter the keyword you searched';
    if (source === 'friend_colleague') {
      if (!referrerName.trim()) return "Please enter your friend's / colleague's name";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(referrerEmail.trim())) return 'Please enter a valid referrer email address';
    }
    if (source === 'email' && !emailSubject.trim()) return 'Please enter the email subject';
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      toast({ title: error, variant: 'destructive' });
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    const { error: dbError } = await supabase
      .from('profiles')
      .update({ discovery_source: source, discovery_details: buildDetails() } as any)
      .eq('id', user.id);
    setSaving(false);
    if (dbError) {
      toast({ title: 'Could not save your answer', description: dbError.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['profile-discovery', user.id] });
    toast({ title: 'Thanks for telling us!' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            How did you hear about us?
          </DialogTitle>
          <DialogDescription>
            One quick question — we'll only ask you once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={source} onValueChange={setSource} className="space-y-2">
            {DISCOVERY_OPTIONS.map((option) => (
              <label
                key={option.value}
                htmlFor={`dsrc-${option.value}`}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  source === option.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <RadioGroupItem value={option.value} id={`dsrc-${option.value}`} />
                <span className="text-sm font-medium">{option.icon} {option.label}</span>
              </label>
            ))}
          </RadioGroup>

          {source === 'social_media' && (
            <div className="space-y-3">
              <Label>Which platform? *</Label>
              <RadioGroup value={platform} onValueChange={setPlatform} className="grid sm:grid-cols-2 gap-2">
                {[
                  { value: 'facebook', label: 'Facebook' },
                  { value: 'instagram', label: 'Instagram' },
                  { value: 'linkedin', label: 'LinkedIn' },
                  { value: 'other', label: 'Other' },
                ].map((p) => (
                  <label
                    key={p.value}
                    htmlFor={`dplat-${p.value}`}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm ${
                      platform === p.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <RadioGroupItem value={p.value} id={`dplat-${p.value}`} />
                    {p.label}
                  </label>
                ))}
              </RadioGroup>
              {platform === 'other' && (
                <Input
                  value={platformOther}
                  onChange={(e) => setPlatformOther(e.target.value)}
                  placeholder="Type the platform name"
                  maxLength={100}
                  className="glass-input"
                />
              )}
            </div>
          )}

          {source === 'google_search' && (
            <div className="space-y-2">
              <Label htmlFor="dkeyword">Which keyword did you search? *</Label>
              <Input
                id="dkeyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g., publish research paper free"
                maxLength={200}
                className="glass-input"
              />
            </div>
          )}

          {source === 'friend_colleague' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="drefname">Their name *</Label>
                <Input
                  id="drefname"
                  value={referrerName}
                  onChange={(e) => setReferrerName(e.target.value)}
                  placeholder="Full name"
                  maxLength={200}
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drefemail">Their email *</Label>
                <Input
                  id="drefemail"
                  type="email"
                  value={referrerEmail}
                  onChange={(e) => setReferrerEmail(e.target.value)}
                  placeholder="name@example.com"
                  maxLength={254}
                  className="glass-input"
                />
              </div>
            </div>
          )}

          {source === 'email' && (
            <div className="space-y-2">
              <Label htmlFor="dsubject">Email subject *</Label>
              <Input
                id="dsubject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject line of the email you received"
                maxLength={200}
                className="glass-input"
              />
            </div>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Submit answer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
