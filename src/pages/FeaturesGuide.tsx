import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PageLayout } from "@/components/layout/PageLayout";
import { GlassCard } from "@/components/layout/GlassCard";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  Share2,
  QrCode,
  Wand2,
  FileText,
  Mail,
  Download,
  Crown,
  Sparkles,
  ShoppingCart,
  Bell,
  Gift,
  Users,
  CheckCircle2,
  MousePointerClick,
} from "lucide-react";

interface Step {
  n: number;
  text: string;
}
interface Feature {
  icon: React.ElementType;
  title: string;
  tagline: string;
  color: string;
  steps: Step[];
  cta?: { label: string; href: string };
}

const features: Feature[] = [
  {
    icon: Share2,
    title: "Publication Card — Share your Paper",
    tagline:
      "A beautifully designed shareable image with your article details and a QR code that opens your paper instantly.",
    color: "from-cyan-500/20 to-blue-500/20",
    steps: [
      { n: 1, text: "Open My Articles from the sidebar." },
      { n: 2, text: "Find your published article and click Publication Card to expand." },
      { n: 3, text: "Tap Download Card to save a high-res PNG with your title, authors, country flag, avatar and QR code." },
      { n: 4, text: "Tap Share Card — on mobile it opens the native share sheet with the image + caption attached." },
      { n: 5, text: "Or use one-click buttons for WhatsApp, LinkedIn, X, Facebook, Instagram or Telegram — the card downloads and the caption is copied so you just paste and post." },
      { n: 6, text: "Your friends & colleagues scan the QR code and instantly read your article — driving more reads & citations." },
    ],
    cta: { label: "Open My Articles", href: "/author/articles" },
  },
  {
    icon: QrCode,
    title: "QR Code — Instant Article Access",
    tagline: "Every publication card carries a unique QR code linked to your article's public page.",
    color: "from-emerald-500/20 to-teal-500/20",
    steps: [
      { n: 1, text: "The QR code is generated automatically the moment your article is published." },
      { n: 2, text: "Print it on posters at conferences or add it to your email signature." },
      { n: 3, text: "Anyone scanning it lands directly on the article abstract — no login required." },
    ],
  },
  {
    icon: Wand2,
    title: "AI Article Writer & AI Correct",
    tagline: "Draft new manuscripts and fix rejected ones with a click.",
    color: "from-purple-500/20 to-pink-500/20",
    steps: [
      { n: 1, text: "Use AI Article Writer to draft a full paper from a topic + abstract." },
      { n: 2, text: "If a manuscript is rejected or needs revision, open the article and click AI Auto-Fix." },
      { n: 3, text: "The AI rewrites weak sections, fixes references, and returns a polished .docx." },
      { n: 4, text: "Review, then resubmit — the automation restarts from AI Review automatically." },
    ],
    cta: { label: "Try AI Writer", href: "/author/ai-write" },
  },
  {
    icon: FileText,
    title: "Review Reports — 2 Free, then ₹100 each",
    tagline: "Every author gets 2 free lifetime review report downloads.",
    color: "from-orange-500/20 to-red-500/20",
    steps: [
      { n: 1, text: "Open My Articles → any article with a completed review." },
      { n: 2, text: "Click Review Report → your first 2 downloads (across all articles, lifetime) are free." },
      { n: 3, text: "After that, pay ₹100 per report right from the popup — download starts instantly." },
      { n: 4, text: "Or upgrade to Pro and get 10 free downloads every month." },
    ],
  },
  {
    icon: Crown,
    title: "Pro Plan — Do More, Pay Less",
    tagline: "Discounted fees, free certificates, 10 review reports/month, and co-author editing.",
    color: "from-amber-500/20 to-yellow-500/20",
    steps: [
      { n: 1, text: "Open Subscription from the sidebar." },
      { n: 2, text: "Choose Pro (auto-pay via Razorpay or PayPal)." },
      { n: 3, text: "Instantly unlock lower publication fees, 10 review reports/month and free co-author certificates." },
      { n: 4, text: "Edit author & co-author details anytime (Pro-only feature)." },
    ],
    cta: { label: "See Pro Plan", href: "/author/subscription" },
  },
  {
    icon: Mail,
    title: "Email Preferences & One-click Unsubscribe",
    tagline: "You control which emails you receive.",
    color: "from-sky-500/20 to-indigo-500/20",
    steps: [
      { n: 1, text: "Open Email Preferences from the sidebar." },
      { n: 2, text: "Toggle categories: Fee Reminders, Revision Requests, Announcements, Marketing." },
      { n: 3, text: "Every email also carries a signed unsubscribe link at the bottom — one click and you're out." },
    ],
    cta: { label: "Manage Emails", href: "/author/email-preferences" },
  },
  {
    icon: ShoppingCart,
    title: "Smart Cart — Auto Discounts & Direct Pay",
    tagline: "Discount codes apply automatically. Fee reminder emails carry a Pay Now button.",
    color: "from-fuchsia-500/20 to-purple-500/20",
    steps: [
      { n: 1, text: "When your article is accepted, open Cart." },
      { n: 2, text: "Default admin-configured discounts apply automatically." },
      { n: 3, text: "Tap any suggested discount chip to try it — the best price is shown." },
      { n: 4, text: "Or click Pay Now inside a reminder email — it deep-links straight to checkout." },
    ],
  },
  {
    icon: Gift,
    title: "Referral Rewards",
    tagline: "Invite colleagues and earn 15% discount codes when they publish.",
    color: "from-rose-500/20 to-pink-500/20",
    steps: [
      { n: 1, text: "Open Rewards to grab your unique referral link." },
      { n: 2, text: "Share it with fellow researchers." },
      { n: 3, text: "When they publish, you both get a discount code — 15% for you, 10% for them." },
    ],
    cta: { label: "See Rewards", href: "/author/rewards" },
  },
  {
    icon: Bell,
    title: "Live Notifications & Payment Alerts",
    tagline: "Every status change, review, payment and reply hits the bell instantly.",
    color: "from-lime-500/20 to-green-500/20",
    steps: [
      { n: 1, text: "Click the bell in the top-right of your dashboard." },
      { n: 2, text: "See real-time updates on submissions, reviews, payments and admin messages." },
    ],
  },
];

function FeaturesGuideBody() {
  return (
    <div className="space-y-10">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-2xl mx-auto"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">New Features Guide</span>
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-bold gradient-text mb-3">
          Everything new on WWJMRD — in 30 seconds each
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Animated, step-by-step walkthroughs of every feature. Scroll through — each card shows exactly
          how to use it.
        </p>
      </motion.div>

      <div className="grid gap-6">
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: Math.min(i * 0.05, 0.3) }}
            >
              <GlassCard className="p-0 overflow-hidden">
                <div className={`bg-gradient-to-r ${f.color} p-5 sm:p-6 border-b border-[hsl(var(--glass-border))]`}>
                  <div className="flex items-start gap-4">
                    <motion.div
                      whileHover={{ rotate: [0, -6, 6, 0], scale: 1.05 }}
                      transition={{ duration: 0.5 }}
                      className="w-12 h-12 rounded-xl bg-background/40 backdrop-blur flex items-center justify-center shrink-0 border border-white/10"
                    >
                      <Icon className="w-6 h-6 text-primary" />
                    </motion.div>
                    <div className="min-w-0">
                      <h3 className="font-display text-lg sm:text-xl font-bold mb-1">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.tagline}</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-3">
                  {f.steps.map((s, idx) => (
                    <motion.div
                      key={s.n}
                      initial={{ opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.35, delay: idx * 0.08 }}
                      className="flex items-start gap-3 group"
                    >
                      <motion.div
                        whileHover={{ scale: 1.15 }}
                        className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 text-xs font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                      >
                        {s.n}
                      </motion.div>
                      <p className="text-sm text-foreground/90 leading-relaxed pt-0.5">{s.text}</p>
                    </motion.div>
                  ))}

                  {f.cta && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 }}
                      className="pt-2"
                    >
                      <Link to={f.cta.href}>
                        <Button size="sm" className="gap-2 gradient-primary">
                          <MousePointerClick className="w-3.5 h-3.5" />
                          {f.cta.label}
                        </Button>
                      </Link>
                    </motion.div>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
      >
        <GlassCard className="p-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
          <h3 className="font-display text-lg font-semibold mb-1">That's a wrap!</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Have a question or need help? We're one click away.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link to="/contact">
              <Button variant="outline" size="sm">
                <Users className="w-4 h-4 mr-1" /> Contact Us
              </Button>
            </Link>
            <Link to="/guidelines">
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-1" /> Layout Guidelines
              </Button>
            </Link>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

export default function FeaturesGuide() {
  const { user } = useAuth();

  if (user) {
    return (
      <DashboardLayout type="author">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-display text-3xl font-bold mb-6 gradient-text flex items-center gap-2">
            <Sparkles className="w-7 h-7" /> Features Guide
          </h1>
          <FeaturesGuideBody />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-16 pt-28 max-w-4xl">
        <Link to="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Home
          </Button>
        </Link>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-6 gradient-text flex items-center gap-2">
          <Sparkles className="w-8 h-8" /> Features Guide
        </h1>
        <FeaturesGuideBody />
      </div>
    </PageLayout>
  );
}
