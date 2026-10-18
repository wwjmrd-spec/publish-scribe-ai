import React from 'react';
import { cn } from '@/lib/utils';

/** Fee settings fields used for the old/new price display. */
export interface PriceDisplaySettings {
  old_prices?: Record<string, number | string | null> | null;
  show_old_price?: boolean | null;
  new_price_label?: string | null;
}

/** Returns the old price for a fee key only when it should be shown (enabled and higher than the charged price). */
export function getOldPrice(settings: PriceDisplaySettings | null | undefined, key: string, newPrice: number): number | null {
  if (!settings?.show_old_price) return null;
  const raw = settings.old_prices?.[key];
  const old = Number(raw);
  if (!Number.isFinite(old) || old <= 0 || old <= newPrice) return null;
  return old;
}

interface PriceTagProps {
  settings: PriceDisplaySettings | null | undefined;
  feeKey: string;
  price: number;
  symbol: string;
  className?: string;
  showLabel?: boolean;
}

/** Shows the charged (new) price; when enabled, the old price is shown small and crossed out. */
export function PriceTag({ settings, feeKey, price, symbol, className, showLabel = true }: PriceTagProps) {
  const old = getOldPrice(settings, feeKey, price);
  if (old == null) {
    return <span className={className}>{symbol}{price.toLocaleString()}</span>;
  }
  const label = settings?.new_price_label?.trim();
  return (
    <span className={cn('inline-flex flex-col items-end leading-tight', className)}>
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-xs font-normal text-muted-foreground line-through">{symbol}{old.toLocaleString()}</span>
        <span className="price-shine text-base font-extrabold">{symbol}{price.toLocaleString()}</span>
      </span>
      {showLabel && label && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{label}</span>
      )}
    </span>
  );
}
