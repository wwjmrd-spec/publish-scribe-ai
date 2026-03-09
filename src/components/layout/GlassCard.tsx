import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  gradient?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className, hover = false, gradient = false, onClick }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onClick={onClick}
      className={cn(
        "glass-card p-6",
        hover && "hover-glow-cyan cursor-pointer",
        gradient && "gradient-border",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
