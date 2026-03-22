import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { FileText, Mail, Lock, User, Building, Globe, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { lovable } from '@/integrations/lovable';
import { isHoneypotFilled, isSubmissionTooFast } from '@/lib/antispam';
import { lovable } from '@/integrations/lovable';

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const signUpSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  country: z.string().min(2, 'Please enter your country'),
  affiliation: z.string().min(2, 'Please enter your affiliation')
});

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formLoadTime] = useState(Date.now());
  const [honeypot, setHoneypot] = useState('');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [affiliation, setAffiliation] = useState('');

  const { signIn, signUp, user, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);

  // Detect country on mount
  useEffect(() => {
    const detectCountry = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_name) {
          setCountry(data.country_name);
        }
      } catch (error) {
        console.log('Could not detect country');
      }
    };
    detectCountry();
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (user && userRole) {
      if (userRole === 'admin') {
        navigate('/admin');
      } else {
        navigate('/author');
      }
    }
  }, [user, userRole, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const validation = signUpSchema.safeParse({ email, password, fullName, country, affiliation });
        if (!validation.success) {
          setError(validation.error.errors[0].message);
          setLoading(false);
          return;
        }

        const { error } = await signUp(email, password, fullName, country, affiliation);
        if (error) {
          setError('Unable to complete registration. Please check your details and try again.');
        } else {
          toast({
            title: 'Account created!',
            description: 'Please check your email to verify your account.'
          });
        }
      } else {
        const validation = signInSchema.safeParse({ email, password });
        if (!validation.success) {
          setError(validation.error.errors[0].message);
          setLoading(false);
          return;
        }

        const { error } = await signIn(email, password);
        if (error) {
          setError('Invalid credentials. Please check your email and password.');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 bg-background flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-24">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-12">

            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl text-foreground">
              PubPortal
            </span>
          </motion.div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8">

            <h1 className="text-3xl font-bold text-foreground mb-2">
              {isSignUp ? 'Create an account' : 'Welcome back!'}
            </h1>
            <p className="text-muted-foreground">
              {isSignUp ?
              'Sign up to start publishing your articles' :
              'Log in to your PubPortal account'}
            </p>
          </motion.div>

          {/* Error Message */}
          <AnimatePresence>
            {error &&
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-3">

                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </motion.div>
            }
          </AnimatePresence>

          {/* Google Sign In */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mb-6">

            <Button
              type="button"
              variant="outline"
              disabled={googleLoading}
              onClick={async () => {
                setGoogleLoading(true);
                setError(null);
                try {
                  const { error } = await lovable.auth.signInWithOAuth('google', {
                    redirect_uri: window.location.origin
                  });
                  if (error) {
                    setError('Failed to sign in with Google. Please try again.');
                  }
                } catch (err) {
                  setError('Failed to sign in with Google. Please try again.');
                } finally {
                  setGoogleLoading(false);
                }
              }}
              className="w-full h-11 bg-muted/50 border-border hover:bg-muted flex items-center justify-center gap-3">

              {googleLoading ?
              <GlassSpinner size="sm" /> :

              <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />

                    <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />

                    <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />

                    <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />

                  </svg>
                  Continue with Google
                </>
              }
            </Button>
          </motion.div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Form */}
          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            onSubmit={handleSubmit}
            className="space-y-5">

            <AnimatePresence mode="wait">
              {isSignUp &&
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-5 overflow-hidden">

                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-sm font-medium text-foreground">
                      Full Name
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                      id="fullName"
                      type="text"
                      placeholder="Enter your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10 h-11 bg-muted/50 border-border focus:border-primary" />

                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="country" className="text-sm font-medium text-foreground">
                        Country
                      </Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                        id="country"
                        type="text"
                        placeholder="Country"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="pl-10 h-11 bg-muted/50 border-border focus:border-primary" />

                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="affiliation" className="text-sm font-medium text-foreground">
                        Affiliation
                      </Label>
                      <div className="relative">
                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                        id="affiliation"
                        type="text"
                        placeholder="University"
                        value={affiliation}
                        onChange={(e) => setAffiliation(e.target.value)}
                        className="pl-10 h-11 bg-muted/50 border-border focus:border-primary" />

                      </div>
                    </div>
                  </div>
                </motion.div>
              }
            </AnimatePresence>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 bg-muted/50 border-border focus:border-primary" />

              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                {!isSignUp &&
                <button
                  type="button"
                  className="text-sm text-primary hover:text-primary/80 transition-colors">

                    Forgot your password?
                  </button>
                }
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11 bg-muted/50 border-border focus:border-primary" />

              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-foreground text-background hover:bg-foreground/90 font-medium">

              {loading ?
              <GlassSpinner size="sm" /> :

              isSignUp ? 'Sign up' : 'Login'
              }
            </Button>
          </motion.form>

          {/* Toggle Sign Up / Sign In */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 text-center text-sm text-muted-foreground">

            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <button
              type="button"
              onClick={() => {setIsSignUp(!isSignUp);setError(null);}}
              className="text-primary hover:text-primary/80 font-medium underline underline-offset-4 transition-colors">

              {isSignUp ? 'Log in' : 'Sign up'}
            </button>
          </motion.p>

          {isSignUp &&
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-4 text-center text-xs text-muted-foreground">

              By signing up, you agree to our Terms of Service and Privacy Policy.
            </motion.p>
          }
        </div>
      </div>

      {/* Right Side - Gradient Illustration */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.3)] via-[hsl(var(--accent)/0.5)] to-[hsl(200,80%,70%)] px-0 rounded-xl mx-[10px] my-[10px]">
          {/* Animated Blobs */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              x: [0, 30, 0],
              y: [0, -20, 0]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[hsl(var(--primary)/0.4)] blur-3xl" />

          <motion.div
            animate={{
              scale: [1.2, 1, 1.2],
              x: [0, -40, 0],
              y: [0, 30, 0]
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[hsl(220,80%,60%/0.5)] blur-3xl" />

          <motion.div
            animate={{
              scale: [1, 1.3, 1],
              x: [0, 20, 0],
              y: [0, 40, 0]
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute top-1/2 right-1/3 w-64 h-64 rounded-full bg-[hsl(var(--accent)/0.3)] blur-3xl" />

        </div>

        {/* Chat Input Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="absolute bottom-1/3 right-12 left-12">

          <div className="bg-white/20 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-white/30">
            <div className="flex items-center gap-3">
              <div className="flex-1 text-white/70 text-sm">
                How do I submit my research article?
              </div>
              <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Floating Elements */}
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 right-1/4">

          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center">
            <FileText className="w-8 h-8 text-white" />
          </div>
        </motion.div>
      </div>
    </div>);

}