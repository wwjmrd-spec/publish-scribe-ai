import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  X, ArrowRight, ArrowLeft, FileText, MousePointerClick, Download,
  Share2, Smartphone, QrCode, CheckCircle2,
} from 'lucide-react';
import step1Img from '@/assets/guide/step1.jpg';
import step2Img from '@/assets/guide/step2.jpg';
import step3Img from '@/assets/guide/step3.jpg';
import step4Img from '@/assets/guide/step4.jpg';
import step5Img from '@/assets/guide/step5.jpg';
import step6Img from '@/assets/guide/step6.jpg';

const STORAGE_KEY = 'pubcard-guide-completed-v1';

export function hasSeenPublicationCardGuide() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

const steps = [
  {
    icon: FileText,
    image: step1Img,
    step: 'Step 1',
    title: 'Open My Articles',
    description: 'Everything starts here — your submissions and published papers live in this page.',
  },
  {
    icon: MousePointerClick,
    image: step2Img,
    step: 'Step 2',
    title: 'Expand Publication Card',
    description: 'Find your published article and click Publication Card to expand your personalised card.',
  },
  {
    icon: Download,
    image: step3Img,
    step: 'Step 3',
    title: 'Download Card',
    description: 'Tap Download Card to save a high-resolution PNG with your article details and QR code.',
  },
  {
    icon: Share2,
    image: step4Img,
    step: 'Step 4',
    title: 'Share Card',
    description: 'Tap Share Card — on mobile it opens the native share sheet with the image and caption attached.',
  },
  {
    icon: Smartphone,
    image: step5Img,
    step: 'Step 5',
    title: 'One-click social buttons',
    description: 'Use WhatsApp, LinkedIn, X, Facebook, Instagram or Telegram — the card downloads and the caption is copied automatically.',
  },
  {
    icon: QrCode,
    image: step6Img,
    step: 'Step 6',
    title: 'More reads & citations',
    description: 'Friends and colleagues scan the QR code and instantly read your article — driving more reads, citations and impact.',
  },
];


export function PublicationCardGuide({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = React.useState(0);
  const isLast = index === steps.length - 1;
  const current = steps[index];
  const Icon = current.icon;

  const finish = (completed: boolean) => {
    if (completed) {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 lg:left-64 z-[9999] flex items-center justify-center p-4 sm:justify-end sm:pr-[6vw] lg:pr-[10vw]"
      >
        <div
          className="absolute inset-0 bg-background/50 backdrop-blur-xl"
          onClick={() => finish(false)}
        />

        <motion.div
          initial={{ opacity: 0, x: 40, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="relative w-full max-w-sm rounded-2xl border border-border/60 bg-card/70 backdrop-blur-2xl shadow-2xl p-6"
        >
          <button
            onClick={() => finish(false)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close guide"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="text-xs font-medium text-primary mb-4 tracking-wide uppercase">
            Publication Card · {current.step} of {steps.length}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.05, type: 'spring', stiffness: 300, damping: 22 }}
                className="mx-auto mb-4 w-full overflow-hidden rounded-xl border border-border/50 bg-background/40"
              >
                <img
                  src={current.image}
                  alt={`${current.step}: ${current.title}`}
                  loading="lazy"
                  width={768}
                  height={512}
                  className="block w-full h-auto object-cover"
                />
              </motion.div>

              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="font-display font-bold text-lg mb-2 text-foreground">
                  {current.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  {current.description}
                </p>
              </div>
            </motion.div>

          </AnimatePresence>

          <div className="flex items-center gap-1.5 mb-5">
            {steps.map((_, i) => (
              <motion.div
                key={i}
                layout
                transition={{ duration: 0.3 }}
                className={`h-1.5 rounded-full ${
                  i === index ? 'w-7 bg-primary' : i < index ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => finish(false)}
              className="text-muted-foreground"
            >
              Skip
            </Button>
            <div className="flex items-center gap-2">
              {index > 0 && (
                <Button variant="outline" size="sm" onClick={() => setIndex(index - 1)} className="gap-1">
                  <ArrowLeft className="w-3 h-3" /> Back
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1 gradient-primary"
                onClick={() => (isLast ? finish(true) : setIndex(index + 1))}
              >
                {isLast ? (
                  <>
                    Got it <CheckCircle2 className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    Next <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
