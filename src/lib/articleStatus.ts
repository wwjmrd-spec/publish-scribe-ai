// Centralized article status helpers — keep in sync with the article_status enum.

export const ARTICLE_STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  manuscript_accepted: 'Manuscript Accepted',
  pending_fee: 'Pending Fee',
  paid: 'Paid',
  free: 'Free',
  payment_under_review: 'Payment Under Review',
  failed_payment: 'Failed Payment',
  published: 'Published',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  copyright_received: 'Copyright Received',
  ai_review_generated: 'AI Review Generated',
  revision_requested: 'Manuscript Revision Requested',
  revised_submitted: 'Revised Manuscript Submitted',
  revised_review_generated: 'Revised Review Generated',
  galley_proof_sent: 'Galley Proof Sent',
  galley_proof_approved: 'Galley Proof Approved',
  galley_proof_revised: 'Revised Galley Proof Submitted',
};


export const ARTICLE_STATUS_BADGES: Record<string, string> = {
  submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  under_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  manuscript_accepted: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  pending_fee: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  paid: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  free: 'bg-lime-500/20 text-lime-400 border-lime-500/30',

  payment_under_review: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  failed_payment: 'bg-red-500/20 text-red-400 border-red-500/30',
  published: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  withdrawn: 'bg-muted text-muted-foreground border-border',
  copyright_received: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  ai_review_generated: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  revision_requested: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  revised_submitted: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  revised_review_generated: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
  galley_proof_sent: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  galley_proof_approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  galley_proof_revised: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export function formatArticleStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return (
    ARTICLE_STATUS_LABELS[status] ||
    status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

export function getArticleStatusBadgeClass(status: string | null | undefined): string {
  if (!status) return 'bg-muted text-muted-foreground';
  return ARTICLE_STATUS_BADGES[status] || 'bg-muted text-muted-foreground';
}

// Statuses an admin can set manually from the article detail page.
// Excludes payment-flow statuses which are set by the payment system.
export const MANUAL_ADMIN_STATUSES: { value: string; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'copyright_received', label: 'Copyright Received' },
  { value: 'ai_review_generated', label: 'AI Review Generated' },
  { value: 'manuscript_accepted', label: 'Manuscript Accepted' },
  { value: 'revision_requested', label: 'Manuscript Revision Requested' },
  { value: 'revised_submitted', label: 'Revised Manuscript Submitted' },
  { value: 'revised_review_generated', label: 'Revised Review Generated' },
  { value: 'pending_fee', label: 'Pending Fee' },
  { value: 'paid', label: 'Paid' },
  { value: 'galley_proof_sent', label: 'Galley Proof Sent' },
  { value: 'galley_proof_approved', label: 'Galley Proof Approved' },
  { value: 'galley_proof_revised', label: 'Revised Galley Proof Submitted' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];
