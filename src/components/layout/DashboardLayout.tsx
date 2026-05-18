import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Upload,
  ShoppingCart,
  Award,
  Users,
  Settings,
  BarChart3,
  Tag,
  Bell,
  LogOut,
  Home,
  Menu,
  X,
  Brain,
  UserCircle,
  Crown,
  Gift,
  Megaphone,
  Bug,
  Send,
  Mail,
} from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { GuidedTour } from '@/components/onboarding/GuidedTour';
import { useSubscription } from '@/hooks/useSubscription';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  tourId?: string;
}

const authorNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/author', icon: Home, tourId: 'dashboard' },
  { label: 'Submit Article', href: '/author/submit', icon: Upload, tourId: 'submit-article' },
  { label: 'My Articles', href: '/author/articles', icon: FileText, tourId: 'my-articles' },
  { label: 'Cart', href: '/author/cart', icon: ShoppingCart, tourId: 'cart' },
  { label: 'Certificates', href: '/author/certificates', icon: Award, tourId: 'certificates' },
  { label: 'Subscription', href: '/author/subscription', icon: Crown, tourId: 'subscription' },
  { label: 'Rewards', href: '/author/rewards', icon: Gift, tourId: 'rewards' },
  { label: 'Profile', href: '/author/profile', icon: UserCircle, tourId: 'profile' },
];

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: BarChart3 },
  { label: 'Articles', href: '/admin/articles', icon: FileText },
  { label: 'AI Review', href: '/admin/ai-review', icon: Brain },
  { label: 'AI Settings', href: '/admin/ai-settings', icon: Settings },
  { label: 'Formatting', href: '/admin/formatting', icon: FileText },
  { label: 'Galley Proofs', href: '/admin/galley-proofs', icon: Send },
  { label: 'Publishing Queue', href: '/admin/publish-queue', icon: Upload },
  { label: 'Authors', href: '/admin/authors', icon: Users },
  { label: 'Pro Subscribers', href: '/admin/pro-subscribers', icon: Crown },
  { label: 'Discount Codes', href: '/admin/discounts', icon: Tag },
  { label: 'Revenue', href: '/admin/revenue', icon: BarChart3 },
  { label: 'Fee Settings', href: '/admin/fees', icon: Settings },
  { label: 'USDT Payments', href: '/admin/usdt-payments', icon: Settings },
  { label: 'Reminders', href: '/admin/reminders', icon: Bell },
  { label: 'Notifications', href: '/admin/notifications', icon: Megaphone },
  { label: 'Sent Emails', href: '/admin/email-log', icon: Mail },
  { label: 'Payment Activity', href: '/admin/payment-activity', icon: ShoppingCart },
  { label: 'Bug Reports', href: '/admin/bug-reports', icon: Bug },
  { label: 'Profile', href: '/admin/profile', icon: UserCircle },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
  type: 'author' | 'admin';
}

export function DashboardLayout({ children, type }: DashboardLayoutProps) {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [showTour, setShowTour] = React.useState(false);
  const [showReferBanner, setShowReferBanner] = React.useState(() => {
    if (typeof window !== 'undefined' && user?.id) {
      return !localStorage.getItem(`refer_banner_dismissed_${user?.id}`);
    }
    return true;
  });

  const { subscription } = useSubscription();
  const showUpgradeBanner = type === 'author' && !subscription.canDownloadReport && subscription.plan === 'free';

  const { data: profileData } = useQuery({
    queryKey: ['profile-is-indian', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_indian')
        .eq('id', user!.id)
        .single();
      return data;
    },
    enabled: !!user?.id && type === 'author',
  });
  const isIndian = profileData?.is_indian ?? false;

  React.useEffect(() => {
    if (user) {
      const tourKey = `pubportal_tour_seen_${user.id}`;
      if (!localStorage.getItem(tourKey)) {
        // Small delay to let the layout render
        const timer = setTimeout(() => setShowTour(true), 800);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  const handleTourComplete = (dontShowAgain: boolean) => {
    setShowTour(false);
    if (user && dontShowAgain) {
      localStorage.setItem(`pubportal_tour_seen_${user.id}`, 'true');
    }
  };

  const navItems = type === 'admin' ? adminNavItems : authorNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex">
      {/* Fixed background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--gradient-start))] via-background to-[hsl(var(--gradient-end))]" />
        <div 
          className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-20 dark:opacity-30"
          style={{
            background: 'radial-gradient(circle, hsl(var(--glow-cyan) / 0.15) 0%, transparent 70%)',
          }}
        />
        <div 
          className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full opacity-20 dark:opacity-30"
          style={{
            background: 'radial-gradient(circle, hsl(var(--glow-purple) / 0.15) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 fixed top-0 left-0 bottom-0 glass-card rounded-none border-r border-[hsl(var(--glass-border))] z-30">
        <div className="p-6 border-b border-[hsl(var(--glass-border))]">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-xl gradient-text">
                PubPortal
              </span>
            </Link>
            <NotificationBell />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            
            return (
              <Link
                key={item.href}
                to={item.href}
                data-tour={item.tourId}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300",
                  isActive
                    ? "bg-primary/20 text-primary glow-cyan"
                    : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--glass-bg-strong))]"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[hsl(var(--glass-border))]">
          <div className="px-4 py-2 mb-4 text-sm text-muted-foreground truncate">
            {user?.email}
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-card rounded-none border-b border-[hsl(var(--glass-border))]">
        <div className="flex items-center justify-between p-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg gradient-text">
              PubPortal
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="lg:hidden fixed top-16 left-0 right-0 bottom-0 z-40 glass-card-strong rounded-none border-b border-[hsl(var(--glass-border))] overflow-y-auto"
        >
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300",
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </Button>
          </nav>
        </motion.div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 mt-16 lg:mt-0 overflow-y-auto h-screen">
        {/* Upgrade to Pro Banner */}
        {showUpgradeBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="cursor-pointer bg-gradient-to-r from-amber-500/90 to-orange-500/90 px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-white"
            onClick={() => navigate('/author/subscription')}
          >
            <Crown className="w-4 h-4" />
            <span>🚀 <strong>Upgrade to Pro</strong> — Download review reports, submit free articles &amp; get co-author certificates!</span>
          </motion.div>
        )}
        {/* Refer & Earn Banner */}
        {type === 'author' && showReferBanner && location.pathname !== '/author/rewards' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative cursor-pointer gradient-secondary px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium text-secondary-foreground"
            onClick={() => navigate('/author/rewards')}
          >
            <Gift className="w-4 h-4" />
            <span>🎉 <strong>Refer &amp; Earn</strong> — Invite friends and get up to <strong>{isIndian ? '₹1,500' : '$50'} off</strong> your next publication!</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowReferBanner(false);
                if (user?.id) localStorage.setItem(`refer_banner_dismissed_${user.id}`, 'true');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-secondary-foreground/10 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* Guided Tour for new users */}
      {showTour && (
        <GuidedTour type={type} onComplete={handleTourComplete} />
      )}
    </div>
  );
}
