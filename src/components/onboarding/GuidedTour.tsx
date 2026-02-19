import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';


interface TourStep {
  selector: string;
  title: string;
  description: string;
}

const authorTourSteps: TourStep[] = [
  {
    selector: '[data-tour="dashboard"]',
    title: '📊 Dashboard',
    description: 'Your home base! See article stats, quick actions, and recent submissions at a glance.',
  },
  {
    selector: '[data-tour="submit-article"]',
    title: '📤 Submit Article',
    description: 'Upload your .docx research paper and our AI will automatically extract title, abstract, keywords & co-authors for you!',
  },
  {
    selector: '[data-tour="my-articles"]',
    title: '📄 My Articles',
    description: 'Track all your submissions — see their review status, download review reports, and resubmit revised versions.',
  },
  {
    selector: '[data-tour="cart"]',
    title: '🛒 Cart & Payments',
    description: 'Once your article is approved, pay the publication fee here via Razorpay (INR) or PayPal (USD).',
  },
  {
    selector: '[data-tour="certificates"]',
    title: '🏆 Certificates',
    description: 'Download your publication certificates and co-author certificates after your article is published.',
  },
  {
    selector: '[data-tour="subscription"]',
    title: '👑 Subscription',
    description: 'Upgrade to Pro for discounted fees, free co-author certificates, and AI review reports every month.',
  },
  {
    selector: '[data-tour="rewards"]',
    title: '🎁 Rewards',
    description: 'Refer fellow researchers and earn rewards! Share your unique referral code to get benefits.',
  },
  {
    selector: '[data-tour="profile"]',
    title: '👤 Profile',
    description: 'Update your name, affiliation, country, and manage your account settings.',
  },
];

interface GuidedTourProps {
  type: 'author' | 'admin';
  onComplete: (dontShowAgain: boolean) => void;
}

export function GuidedTour({ type, onComplete }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});
  const [dontShowAgain, setDontShowAgain] = useState(true);
  

  const steps = type === 'author' ? authorTourSteps : authorTourSteps.slice(0, 1);
  const step = steps[currentStep];

  const positionTooltip = useCallback(() => {
    if (!step) return;

    const viewportW = window.innerWidth;
    const isMobileView = viewportW < 768;

    const centeredStyle: React.CSSProperties = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: 'min(320px, calc(100vw - 32px))',
      width: 'calc(100vw - 32px)',
    };

    // On mobile, always show centered card regardless of element visibility
    if (isMobileView) {
      setHighlightStyle({ display: 'none' });
      setTooltipStyle(centeredStyle);
      return;
    }

    const el = document.querySelector(step.selector);
    const rect = el?.getBoundingClientRect();
    // If element doesn't exist or is hidden (zero size), center the tooltip
    if (!el || !rect || (rect.width === 0 && rect.height === 0)) {
      setHighlightStyle({ display: 'none' });
      setTooltipStyle(centeredStyle);
      return;
    }

    const vw = window.innerWidth;
    const viewportH = window.innerHeight;

    setHighlightStyle({
      position: 'fixed',
      top: rect.top - 4,
      left: rect.left - 4,
      width: rect.width + 8,
      height: rect.height + 8,
      borderRadius: '12px',
      display: 'block',
    });

    const tooltipW = 320;
    const spaceRight = vw - rect.right - 16;
    const spaceBottom = viewportH - rect.bottom - 16;

    if (spaceRight >= tooltipW) {
      // Position right
      setTooltipStyle({
        position: 'fixed',
        top: Math.min(rect.top, viewportH - 280),
        left: rect.right + 16,
        maxWidth: tooltipW,
      });
    } else if (spaceBottom >= 200) {
      // Position bottom
      setTooltipStyle({
        position: 'fixed',
        top: rect.bottom + 16,
        left: Math.max(8, Math.min(rect.left, vw - tooltipW - 8)),
        maxWidth: tooltipW,
      });
    } else {
      // Fallback: position left
      setTooltipStyle({
        position: 'fixed',
        top: Math.min(rect.top, viewportH - 280),
        left: Math.max(8, rect.left - tooltipW - 16),
        maxWidth: tooltipW,
      });
    }
  }, [step]);

  useEffect(() => {
    positionTooltip();
    window.addEventListener('resize', positionTooltip);
    return () => window.removeEventListener('resize', positionTooltip);
  }, [positionTooltip]);

  useEffect(() => {
    if (!step || window.innerWidth < 768) return;
    const el = document.querySelector(step.selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(positionTooltip, 300);
    }
  }, [currentStep, step, positionTooltip]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete(dontShowAgain);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete(dontShowAgain);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999]">
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
          className="border-2 border-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)] z-[100000] pointer-events-none"
        />

        {/* Tooltip */}
        <motion.div
          key={`tooltip-${currentStep}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          style={tooltipStyle}
          className="z-[100001] bg-card border border-border rounded-xl shadow-2xl p-4 sm:p-5 box-border overflow-hidden"
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

          {/* Don't show again */}
          <div className="flex items-center gap-2 mb-4">
            <Checkbox
              id="dont-show"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <label htmlFor="dont-show" className="text-xs text-muted-foreground cursor-pointer select-none">
              Don't show this again
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="gap-1 shrink-0"
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className="gap-1 gradient-primary shrink-0"
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
