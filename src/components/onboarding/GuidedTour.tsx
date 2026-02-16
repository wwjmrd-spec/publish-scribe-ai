import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';

interface TourStep {
  selector: string;
  title: string;
  description: string;
  position?: 'right' | 'bottom' | 'left';
}

const authorTourSteps: TourStep[] = [
  {
    selector: '[data-tour="dashboard"]',
    title: '📊 Dashboard',
    description: 'Your home base! See article stats, quick actions, and recent submissions at a glance.',
    position: 'right',
  },
  {
    selector: '[data-tour="submit-article"]',
    title: '📤 Submit Article',
    description: 'Upload your .docx research paper and our AI will automatically extract title, abstract, keywords & co-authors for you!',
    position: 'right',
  },
  {
    selector: '[data-tour="my-articles"]',
    title: '📄 My Articles',
    description: 'Track all your submissions — see their review status, download review reports, and resubmit revised versions.',
    position: 'right',
  },
  {
    selector: '[data-tour="cart"]',
    title: '🛒 Cart & Payments',
    description: 'Once your article is approved, pay the publication fee here via Razorpay (INR) or PayPal (USD).',
    position: 'right',
  },
  {
    selector: '[data-tour="certificates"]',
    title: '🏆 Certificates',
    description: 'Download your publication certificates and co-author certificates after your article is published.',
    position: 'right',
  },
  {
    selector: '[data-tour="subscription"]',
    title: '👑 Subscription',
    description: 'Upgrade to Pro for discounted fees, free co-author certificates, and AI review reports every month.',
    position: 'right',
  },
  {
    selector: '[data-tour="rewards"]',
    title: '🎁 Rewards',
    description: 'Refer fellow researchers and earn rewards! Share your unique referral code to get benefits.',
    position: 'right',
  },
  {
    selector: '[data-tour="profile"]',
    title: '👤 Profile',
    description: 'Update your name, affiliation, country, and manage your account settings.',
    position: 'right',
  },
];

interface GuidedTourProps {
  type: 'author' | 'admin';
  onComplete: () => void;
}

export function GuidedTour({ type, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});

  const steps = type === 'author' ? authorTourSteps : authorTourSteps.slice(0, 1);
  const step = steps[currentStep];

  const positionTooltip = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) return;

    const rect = el.getBoundingClientRect();

    setHighlightStyle({
      position: 'fixed',
      top: rect.top - 4,
      left: rect.left - 4,
      width: rect.width + 8,
      height: rect.height + 8,
      borderRadius: '12px',
    });

    const pos = step.position || 'right';
    if (pos === 'right') {
      setTooltipStyle({
        position: 'fixed',
        top: rect.top,
        left: rect.right + 16,
        maxWidth: 320,
      });
    } else if (pos === 'bottom') {
      setTooltipStyle({
        position: 'fixed',
        top: rect.bottom + 16,
        left: rect.left,
        maxWidth: 320,
      });
    }
  }, [step]);

  useEffect(() => {
    positionTooltip();
    window.addEventListener('resize', positionTooltip);
    return () => window.removeEventListener('resize', positionTooltip);
  }, [positionTooltip]);

  // Scroll element into view
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Reposition after scroll
      setTimeout(positionTooltip, 300);
    }
  }, [currentStep, step, positionTooltip]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999]">
        {/* Overlay */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleSkip}
        />

        {/* Highlight ring */}
        <motion.div
          key={`highlight-${currentStep}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          style={highlightStyle}
          className="border-2 border-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)] z-[10000] pointer-events-none"
        />

        {/* Tooltip */}
        <motion.div
          key={`tooltip-${currentStep}`}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          style={tooltipStyle}
          className="z-[10001] bg-card border border-border rounded-xl shadow-2xl p-5"
        >
          {/* Step counter & skip */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <h3 className="font-display font-bold text-base mb-2 text-foreground">
            {step.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {step.description}
          </p>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-primary'
                    : i < currentStep
                    ? 'w-1.5 bg-primary/50'
                    : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className="gap-1 gradient-primary"
            >
              {currentStep === steps.length - 1 ? "Let's Go!" : 'Next'}
              {currentStep < steps.length - 1 && <ArrowRight className="w-3 h-3" />}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
