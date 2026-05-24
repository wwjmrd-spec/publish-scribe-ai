import React, { useState, useRef } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { Check, X, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

type DownloadState = 'idle' | 'loading' | 'success' | 'error';

interface DownloadButtonProps extends Omit<ButtonProps, 'onClick'> {
  onDownload: () => Promise<unknown>;
  /** When true, show only the icon (with progress overlay). */
  iconOnly?: boolean;
  /** Optional label override; otherwise uses children. */
  children?: React.ReactNode;
}

/**
 * A button with a built-in circular progress spinner that animates while
 * the supplied async `onDownload` runs, then flashes a check/X for ~1.5s.
 */
export function DownloadButton({
  onDownload,
  iconOnly,
  children,
  disabled,
  className,
  variant = 'outline',
  size,
  ...rest
}: DownloadButtonProps) {
  const [state, setState] = useState<DownloadState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === 'loading') return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setState('loading');
    try {
      await onDownload();
      setState('success');
    } catch {
      setState('error');
    } finally {
      resetTimer.current = setTimeout(() => setState('idle'), 1500);
    }
  };

  const renderIcon = () => {
    if (state === 'loading') {
      return (
        <span className="relative inline-flex items-center justify-center w-4 h-4">
          <svg className="absolute inset-0 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
      );
    }
    if (state === 'success') return <Check className="w-4 h-4 text-green-500" />;
    if (state === 'error') return <X className="w-4 h-4 text-red-500" />;
    return <Download className="w-4 h-4" />;
  };

  return (
    <Button
      {...rest}
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || state === 'loading'}
      onClick={handleClick}
      className={cn(className)}
    >
      {renderIcon()}
      {!iconOnly && (
        <span className="ml-2">
          {state === 'loading'
            ? 'Preparing…'
            : state === 'success'
              ? 'Ready'
              : state === 'error'
                ? 'Failed'
                : children}
        </span>
      )}
    </Button>
  );
}
