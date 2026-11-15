import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'author' | 'admin' | null;

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  isIndian: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, country: string, affiliation: string, captchaToken: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

// Keep context identity outside the provider/hook refresh boundary so a live
// provider cannot become disconnected from refreshed useAuth consumers.
export const AuthContext = createContext<AuthContextType | undefined>(undefined);