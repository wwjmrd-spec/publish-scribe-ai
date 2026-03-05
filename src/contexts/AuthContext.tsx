import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useMauticSync } from '@/hooks/useMautic';

type UserRole = 'author' | 'admin' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  isIndian: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, country: string, affiliation: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [isIndian, setIsIndian] = useState(false);
  const [loading, setLoading] = useState(true);
  const { syncContact } = useMauticSync();

  const fetchUserRole = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (data) {
      setUserRole(data.role as UserRole);
    } else {
      // Default to author if no role found
      setUserRole('author');
    }
  };

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('is_indian')
      .eq('id', userId)
      .maybeSingle();
    
    if (data) {
      setIsIndian(data.is_indian || false);
    }
  };

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
      if (session?.user) {
          // Defer Supabase calls to avoid deadlock
          setTimeout(() => {
            fetchUserRole(session.user.id);
            fetchUserProfile(session.user.id);
            // Sync to Mautic on any login/signup (including Google OAuth)
            if (event === 'SIGNED_IN') {
              const meta = session.user.user_metadata;
              const email = session.user.email || '';
              const fullName = meta?.full_name || meta?.name || '';
              const nameParts = fullName.trim().split(' ');
              syncContact({
                email,
                firstname: nameParts[0] || '',
                lastname: nameParts.slice(1).join(' ') || '',
                country: meta?.country || '',
                company: meta?.affiliation || '',
                tags: ['signup', 'author'],
              });
            }
          }, 0);
        } else {
          setUserRole(null);
          setIsIndian(false);
        }
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserRole(session.user.id);
        fetchUserProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string, 
    password: string, 
    fullName: string, 
    country: string,
    affiliation: string
  ) => {
    const redirectUrl = `${window.location.origin}/`;
    const isIndianUser = country.toLowerCase() === 'india';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          country,
          affiliation,
        }
      }
    });

    if (error) {
      return { error };
    }

    // Sync contact to Mautic (fire and forget)
    const nameParts = fullName.trim().split(' ');
    syncContact({
      email,
      firstname: nameParts[0] || '',
      lastname: nameParts.slice(1).join(' ') || '',
      country,
      company: affiliation,
      tags: ['signup', 'author'],
    });

    // Profile and role are automatically created by database trigger
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setIsIndian(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userRole,
      isIndian,
      loading,
      signUp,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
