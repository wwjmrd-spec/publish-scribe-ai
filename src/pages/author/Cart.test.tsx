import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Cart from './Cart';

const checkout = vi.hoisted(() => vi.fn());
const article = { id: '11111111-1111-1111-1111-111111111111', title: 'Research manuscript', reference_number: 'ART-2026-0001', created_at: '2026-11-09', doi_paid: false };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, isIndian: false }) }));
vi.mock('@/contexts/CartContext', () => ({ useCart: () => ({ items: [], removeItem: vi.fn(), clearCart: vi.fn() }) }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ subscription: { plan: 'free' } }) }));
vi.mock('@/hooks/useRazorpay', () => ({ useRazorpay: () => ({ isLoaded: true }) }));
vi.mock('@/hooks/usePayment', () => ({ usePayment: () => ({ isProcessing: false, processRazorpayPayment: checkout }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === 'pending-articles' ? [article] : queryKey[0] === 'publication-fees' ? { international_fee: 29, international_doi_fee: 10, show_old_price: true, old_prices: { international_fee: 79 } } : [] }),
}));

describe('cart fee selection', () => {
  beforeEach(() => checkout.mockClear());

  it('charges $39 for publication plus DOI, without subtracting $50 old-price savings', () => {
    render(<Cart />);
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    const total = screen.getByText('Total').parentElement;
    expect(total).not.toBeNull();
    expect(within(total as HTMLElement).getByText('$39')).toBeInTheDocument();
    expect(screen.getByText('$50')).toBeInTheDocument();
  });

  it('charges only $10 and submits only a DOI item when publication is not selected', async () => {
    render(<Cart />);
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    const total = screen.getByText('Total').parentElement;
    expect(within(total as HTMLElement).getByText('$10')).toBeInTheDocument();
    const pay = screen.getByRole('button', { name: 'Pay with Razorpay' });
    expect(pay).toBeEnabled();
    fireEvent.click(pay);
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ amount: 10, items: [{ type: 'doi', articleId: article.id }] }), '', '', expect.any(Function));
  });
});