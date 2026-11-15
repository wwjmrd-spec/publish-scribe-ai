import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Auth from './Auth';
import ResetPassword from './ResetPassword';

const mocks = vi.hoisted(() => ({ oauth: vi.fn(), reset: vi.fn(), signup: vi.fn(), signin: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, userRole: null, signUp: mocks.signup, signIn: mocks.signin }) }));
vi.mock('@/integrations/lovable', () => ({ lovable: { auth: { signInWithOAuth: mocks.oauth } } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  resetPasswordForEmail: mocks.reset, getSession: async () => ({ data: { session: null } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/auth/TurnstileSignup', () => ({ TurnstileSignup: () => <div /> }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.oauth.mockResolvedValue({ error: null }); mocks.reset.mockResolvedValue({ error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ country_name: 'India' }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('Google login remains through the managed helper and does not call signup guard', async () => {
  render(<MemoryRouter><Auth /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(mocks.oauth).toHaveBeenCalledWith('google', { redirect_uri: window.location.origin }));
  expect(mocks.signup).not.toHaveBeenCalled();
});
it('forgot password retains the standard reset redirect and success state', async () => {
  render(<MemoryRouter><Auth /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
  fireEvent.change(screen.getByLabelText('Email', { selector: '#forgot-email' }), { target: { value: 'author@gmail.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith('author@gmail.com', { redirectTo: `${window.location.origin}/reset-password` }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Check your email' })));
});
it('reset-link resend remains operational through standard auth', async () => {
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'author@gmail.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Resend reset link' }));
  await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith('author@gmail.com', { redirectTo: `${window.location.origin}/reset-password` }));
});