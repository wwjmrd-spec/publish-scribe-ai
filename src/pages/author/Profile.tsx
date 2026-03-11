import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { User, Lock, Camera, Palette, Save, Loader2, Sun, Moon, Monitor, DollarSign, Mail, Settings } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function Profile() {
  const { user, userRole } = useAuth();
  const { theme, setTheme } = useTheme();

  // Profile state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [country, setCountry] = useState('');
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Avatar state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin settings state
  const [adminNotificationEmail, setAdminNotificationEmail] = useState('');
  const [loadingAdminSettings, setLoadingAdminSettings] = useState(false);
  const [savingAdminSettings, setSavingAdminSettings] = useState(false);

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoadingProfile(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, email, affiliation, country, avatar_url, is_indian')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setFullName(data.full_name || '');
      setEmail(data.email || '');
      setAffiliation(data.affiliation || '');
      setCountry(data.country || '');
      setCurrency(data.is_indian ? 'INR' : 'USD');
      setAvatarUrl(data.avatar_url || null);
    }
    if (error) console.error('Failed to fetch profile:', error.message);
    setLoadingProfile(false);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      toast({ title: 'Validation Error', description: 'Full name is required.', variant: 'destructive' });
      return;
    }
    if (fullName.length > 200) {
      toast({ title: 'Validation Error', description: 'Name must be under 200 characters.', variant: 'destructive' });
      return;
    }

    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        affiliation: affiliation.trim() || null,
        country: country.trim() || null,
        is_indian: currency === 'INR',
      })
      .eq('id', user.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update profile.', variant: 'destructive' });
    } else {
      toast({ title: 'Profile Updated', description: 'Your details have been saved.' });
    }
    setSavingProfile(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: 'Validation Error', description: 'New password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Validation Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ title: 'Error', description: 'Failed to update password. Please try again.', variant: 'destructive' });
    } else {
      toast({ title: 'Password Updated', description: 'Your password has been changed.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setSavingPassword(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please upload an image file.', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum size is 2MB.', variant: 'destructive' });
      return;
    }

    setUploadingAvatar(true);
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: 'Upload Error', description: 'Failed to upload avatar.', variant: 'destructive' });
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);

    if (updateError) {
      toast({ title: 'Error', description: 'Failed to save avatar URL.', variant: 'destructive' });
    } else {
      setAvatarUrl(publicUrl);
      toast({ title: 'Avatar Updated', description: 'Your profile picture has been changed.' });
    }
    setUploadingAvatar(false);
  };

  const initials = fullName
    ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const themeOptions: { value: 'dark' | 'light' | 'system'; label: string; icon: React.ElementType }[] = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <DashboardLayout type={userRole === 'admin' ? 'admin' : 'author'}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl mx-auto"
      >
        <h1 className="text-3xl font-display font-bold gradient-text mb-8">My Profile</h1>

        <Tabs defaultValue="details" className="space-y-6">
          <TabsList className="glass-card-strong w-full grid grid-cols-2 sm:grid-cols-4 h-auto p-1 gap-1">
            <TabsTrigger value="details" className="gap-1.5 py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <User className="w-4 h-4" /> <span className="hidden xs:inline">Details</span><span className="xs:hidden">Details</span>
            </TabsTrigger>
            <TabsTrigger value="password" className="gap-1.5 py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Lock className="w-4 h-4" /> Password
            </TabsTrigger>
            <TabsTrigger value="avatar" className="gap-1.5 py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Camera className="w-4 h-4" /> Picture
            </TabsTrigger>
            <TabsTrigger value="theme" className="gap-1.5 py-2.5 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Palette className="w-4 h-4" /> Theme
            </TabsTrigger>
          </TabsList>

          {/* Profile Details */}
          <TabsContent value="details">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-xl font-display font-semibold text-foreground">Personal Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="glass-input"
                    maxLength={200}
                    disabled={loadingProfile}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={email}
                    disabled
                    className="glass-input opacity-60 cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="affiliation">Affiliation</Label>
                  <Input
                    id="affiliation"
                    value={affiliation}
                    onChange={(e) => setAffiliation(e.target.value)}
                    placeholder="University or Organization"
                    className="glass-input"
                    disabled={loadingProfile}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="glass-input"
                    disabled={loadingProfile}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={currency}
                    onValueChange={(val) => setCurrency(val as 'INR' | 'USD')}
                    disabled={loadingProfile}
                  >
                    <SelectTrigger id="currency" className="glass-input">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">₹ INR (Indian Rupee)</SelectItem>
                      <SelectItem value="USD">$ USD (US Dollar)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Used for publication fee calculations.</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={savingProfile || loadingProfile}>
                  {savingProfile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Password Change */}
          <TabsContent value="password">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-xl font-display font-semibold text-foreground">Change Password</h2>
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="glass-input"
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="glass-input"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleChangePassword} disabled={savingPassword || !newPassword || !confirmPassword}>
                  {savingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                  Update Password
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Avatar Upload */}
          <TabsContent value="avatar">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-xl font-display font-semibold text-foreground">Profile Picture</h2>
              <div className="flex flex-col items-center gap-6">
                <div className="relative group">
                  <Avatar className="w-32 h-32 border-2 border-[hsl(var(--glass-border))]">
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt="Profile picture" />
                    ) : null}
                    <AvatarFallback className="text-2xl font-display gradient-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    ) : (
                      <Camera className="w-8 h-8 text-primary" />
                    )}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <div className="text-center space-y-1">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? 'Uploading…' : 'Choose Image'}
                  </Button>
                  <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max 2MB.</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Theme Selection */}
          <TabsContent value="theme">
            <div className="glass-card p-6 space-y-6">
              <h2 className="text-xl font-display font-semibold text-foreground">Appearance</h2>
              <p className="text-sm text-muted-foreground">Choose how PubPortal looks for you.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {themeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const active = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={cn(
                        'flex flex-col items-center gap-3 p-6 rounded-xl border transition-all duration-300 cursor-pointer',
                        active
                          ? 'border-primary bg-primary/10 glow-cyan'
                          : 'border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] hover:border-primary/40'
                      )}
                    >
                      <Icon className={cn('w-8 h-8', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span className={cn('font-medium', active ? 'text-primary' : 'text-foreground')}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </DashboardLayout>
  );
}
