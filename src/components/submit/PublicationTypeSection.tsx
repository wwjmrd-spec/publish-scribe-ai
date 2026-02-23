import React from 'react';
import { GlassCard } from '@/components/layout/GlassCard';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Zap, Clock, IndianRupee, DollarSign } from 'lucide-react';

interface PublicationTypeSectionProps {
  publicationType: 'normal' | 'fast_track';
  setPublicationType: (v: 'normal' | 'fast_track') => void;
  isIndian: boolean;
}

export function PublicationTypeSection({
  publicationType,
  setPublicationType,
  isIndian,
}: PublicationTypeSectionProps) {
  return (
    <GlassCard>
      <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        Publication Type
      </h2>

      <RadioGroup
        value={publicationType}
        onValueChange={(v) => setPublicationType(v as 'normal' | 'fast_track')}
        className="space-y-3"
      >
        {/* Normal */}
        <label
          htmlFor="pub-normal"
          className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
            publicationType === 'normal'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-border hover:border-muted-foreground/30'
          }`}
        >
          <RadioGroupItem value="normal" id="pub-normal" className="mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-foreground">Normal Publication</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Standard review and publication timeline. No additional charges.
            </p>
          </div>
        </label>

        {/* Fast Track */}
        <label
          htmlFor="pub-fast"
          className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
            publicationType === 'fast_track'
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-border hover:border-muted-foreground/30'
          }`}
        >
          <RadioGroupItem value="fast_track" id="pub-fast" className="mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="font-semibold text-foreground">Fast Track Publication</span>
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                {isIndian ? (
                  <>
                    <IndianRupee className="w-3 h-3" />
                    500 extra
                  </>
                ) : (
                  <>
                    <DollarSign className="w-3 h-3" />
                    10 extra
                  </>
                )}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Priority review with expedited publication. Additional fee of{' '}
              {isIndian ? '₹500' : '$10'} will be added to your publication fee.
            </p>
          </div>
        </label>
      </RadioGroup>
    </GlassCard>
  );
}
