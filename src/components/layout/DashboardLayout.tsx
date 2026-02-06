import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
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
  LogOut,
  Home,
  Menu,
  X,
  Brain,
  UserCircle,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const authorNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/author', icon: Home },
  { label: 'Submit Article', href: '/author/submit', icon: Upload },
  { label: 'My Articles', href: '/author/articles', icon: FileText },
  { label: 'Cart', href: '/author/cart', icon: ShoppingCart },
  { label: 'Certificates', href: '/author/certificates', icon: Award },
  { label: 'Profile', href: '/author/profile', icon: UserCircle },
];

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: BarChart3 },
  { label: 'Articles', href: '/admin/articles', icon: FileText },
  { label: 'AI Review', href: '/admin/ai-review', icon: Brain },
  { label: 'Authors', href: '/admin/authors', icon: Users },
  { label: 'Discount Codes', href: '/admin/discounts', icon: Tag },
  { label: 'Fee Settings', href: '/admin/fees', icon: Settings },
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
      <aside className="hidden lg:flex flex-col w-64 glass-card rounded-none border-r border-[hsl(var(--glass-border))]">
        <div className="p-6 border-b border-[hsl(var(--glass-border))]">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl gradient-text">
              PubPortal
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300",
                  isActive
                    ? "bg-primary/20 text-primary glow-cyan"
                    : "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--glass-bg-strong))]"
                )}
              >
                <Icon className="w-5 h-5" />
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="lg:hidden fixed top-16 left-0 right-0 z-40 glass-card-strong rounded-none border-b border-[hsl(var(--glass-border))]"
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
      <main className="flex-1 lg:ml-0 mt-16 lg:mt-0">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
