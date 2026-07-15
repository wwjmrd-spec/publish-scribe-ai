import React from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { GlassCard } from '@/components/layout/GlassCard';
import { Progress } from '@/components/ui/progress';
import { Crown, FileText, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function PlanLimitsCard() {
  const { subscription, isLoading } = useSubscription();
  const navigate = useNavigate();

  if (isLoading) return null;

  const reportPercent = subscription.reviewReportsLimit > 0
    ? Math.min((subscription.reviewReportsUsed / subscription.reviewReportsLimit) * 100, 100)
    : 0;

  const certPercent = subscription.coauthorCertsLimit > 0
    ? Math.min((subscription.coauthorCertsUsed / subscription.coauthorCertsLimit) * 100, 100)
    : 0;

  return (
    <GlassCard className="hover-glow-purple">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Crown className={`w-5 h-5 ${subscription.plan === 'pro' ? 'text-secondary' : 'text-muted-foreground'}`} />
          <h2 className="font-display text-lg font-semibold">
            {subscription.plan === 'pro' ? 'Pro Plan' : 'Free Plan'}
          </h2>
        </div>
        {subscription.plan === 'free' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-primary gap-1"
            onClick={() => navigate('/author/subscription')}
          >
            Upgrade <ArrowRight className="w-3 h-3" />
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {/* Review Reports */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              <span>Review Reports</span>
            </div>
            <span className="font-medium">
              {subscription.reviewReportsUsed}/{subscription.reviewReportsLimit}
              {subscription.plan === 'free' ? ' (lifetime free)' : ' (monthly)'}
            </span>
          </div>
          <Progress value={reportPercent} className="h-2" />
        </div>

        {/* Co-author Certs */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>Co-author Certificates</span>
            </div>
            <span className="font-medium">
              {subscription.plan === 'pro'
                ? `${subscription.coauthorCertsUsed}/${subscription.coauthorCertsLimit} (monthly)`
                : 'Pro only'}
            </span>
          </div>
          {subscription.plan === 'pro' ? (
            <Progress value={certPercent} className="h-2" />
          ) : (
            <Progress value={0} className="h-2 opacity-40" />
          )}
        </div>
      </div>
    </GlassCard>
  );
}
