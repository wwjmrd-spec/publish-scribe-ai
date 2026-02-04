import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  Users, 
  ArrowRight,
  Shield,
  Zap,
  Globe,
} from 'lucide-react';
import { useEffect } from 'react';

const features = [
  {
    icon: Upload,
    title: 'Easy Submission',
    description: 'Upload your .docx articles with a simple drag-and-drop interface',
  },
  {
    icon: Zap,
    title: 'AI-Powered Review',
    description: 'Get instant AI-powered feedback on your articles',
  },
  {
    icon: Shield,
    title: 'Secure Payments',
    description: 'Multiple payment options with enterprise-grade security',
  },
  {
    icon: Globe,
    title: 'Global Reach',
    description: 'International authors welcome with USD and INR support',
  },
];

const stats = [
  { value: '10K+', label: 'Articles Published' },
  { value: '5K+', label: 'Authors Worldwide' },
  { value: '98%', label: 'Satisfaction Rate' },
  { value: '24h', label: 'Avg. Review Time' },
];

export default function Index() {
  const { user, userRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && userRole) {
      if (userRole === 'admin') {
        navigate('/admin');
      } else {
        navigate('/author');
      }
    }
  }, [user, userRole, loading, navigate]);

  return (
    <PageLayout>
      {/* Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 glass-card rounded-none border-b border-[hsl(var(--glass-border))]"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center glow-cyan">
              <FileText className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl gradient-text">
              PubPortal
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="glass">
                Sign In
              </Button>
            </Link>
            <Link to="/auth">
              <Button className="gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)]">
                Get Started
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[hsl(var(--glass-bg-strong))] border border-[hsl(var(--glass-border))] mb-6">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-muted-foreground">AI-Powered Article Review</span>
            </div>

            <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              Publish Your Research
              <br />
              <span className="gradient-text">With Confidence</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              A modern publication portal with AI-powered review, seamless payments, 
              and instant certificate generation for researchers worldwide.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/auth">
                <Button size="xl" className="gradient-primary hover:shadow-[0_0_40px_hsl(var(--primary)/0.5)] min-w-[200px]">
                  Start Publishing
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Button size="xl" variant="outline" className="min-w-[200px]">
                Learn More
              </Button>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8"
          >
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-3xl md:text-4xl font-bold gradient-text">{stat.value}</p>
                <p className="text-sm md:text-base text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Why Choose <span className="gradient-text">PubPortal</span>?
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Everything you need to publish your research, from submission to certification
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <GlassCard hover className="h-full text-center">
                    <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 glow-cyan">
                      <Icon className="w-7 h-7 text-primary-foreground" />
                    </div>
                    <h3 className="font-display text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              How It <span className="gradient-text">Works</span>
            </h2>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { step: '01', title: 'Submit', desc: 'Upload your article in .docx format with co-author details' },
                { step: '02', title: 'Review', desc: 'AI-powered review with detailed feedback report' },
                { step: '03', title: 'Publish', desc: 'Pay the fee and receive your publication certificate' },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className="relative"
                >
                  <GlassCard className="text-center">
                    <div className="text-5xl font-bold gradient-text mb-4">{item.step}</div>
                    <h3 className="font-display text-xl font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </GlassCard>
                  {index < 2 && (
                    <div className="hidden md:block absolute top-1/2 -right-4 transform translate-x-1/2">
                      <ArrowRight className="w-8 h-8 text-primary/30" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <GlassCard className="text-center py-12 md:py-16 gradient-border">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Ready to <span className="gradient-text">Publish</span>?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto mb-8">
                Join thousands of researchers who trust PubPortal for their publication needs
              </p>
              <Link to="/auth">
                <Button size="xl" className="gradient-primary hover:shadow-[0_0_40px_hsl(var(--primary)/0.5)]">
                  Create Free Account
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-[hsl(var(--glass-border))]">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold gradient-text">PubPortal</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 PubPortal. All rights reserved.
          </p>
        </div>
      </footer>
    </PageLayout>
  );
}
