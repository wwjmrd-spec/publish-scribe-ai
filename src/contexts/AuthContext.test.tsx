import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { AuthContext } from './authState';
import { useContext } from 'react';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), signIn: vi.fn(), sync: vi.fn(), segment: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    getSession: async () => ({ data: { session: null } }), signInWithPassword: mocks.signIn },
} }));
vi.mock('@/hooks/useMautic', () => ({ useMauticSync: () => ({ syncContact: mocks.sync, addToSegment: mocks.segment }) }));
function Probe() {
  const auth = useAuth();
  return <><button onClick={async () => {
    const result = await auth.signUp('author@gmail.com', 'test-password', 'Test Author', 'India', 'University', 'test-captcha');
    document.getElementById('result')?.replaceChildren(result.error?.message || 'confirmation required');
  }}>Register</button><button onClick={() => auth.signIn('author@gmail.com', 'test-password')}>Login</button><output id="result" /></>;
}
beforeEach(() => { vi.clearAllMocks(); mocks.sync.mockResolvedValue({}); mocks.segment.mockResolvedValue({}); mocks.signIn.mockResolvedValue({ error: null }); });
afterEach(cleanup);
describe('guarded registration preserves existing auth', () => {
  it('provider and hook share the stable context used by global consumers', async () => {
    function GlobalConsumer() {
      const state = useContext(AuthContext);
      const auth = useAuth();
      return <output>{state === auth ? 'same auth state' : 'disconnected'}</output>;
    }
    render(<AuthProvider><GlobalConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('same auth state')).toBeInTheDocument());
  });
  it('submits CAPTCHA to server and retains Mautic registration sync without signing in', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    render(<AuthProvider><Probe /></AuthProvider>); fireEvent.click(screen.getByText('Register'));
    await waitFor(() => expect(screen.getByText('confirmation required')).toBeInTheDocument());
    expect(mocks.invoke).toHaveBeenCalledWith('signup-guard', { body: { email: 'author@gmail.com', password: 'test-password', fullName: 'Test Author', country: 'India', affiliation: 'University', captchaToken: 'test-captcha' } });
    expect(mocks.sync).toHaveBeenCalledTimes(1); expect(mocks.segment).toHaveBeenCalledWith('author@gmail.com', 'New Sign Up');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('displays server rejection and does not sync rejected registration', async () => {
    mocks.invoke.mockResolvedValue({ data: { error: 'Temporary email addresses are not accepted.' }, error: null });
    render(<AuthProvider><Probe /></AuthProvider>); fireEvent.click(screen.getByText('Register'));
    await waitFor(() => expect(screen.getByText('Temporary email addresses are not accepted.')).toBeInTheDocument());
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('existing email login uses the unchanged password sign-in path', async () => {
    render(<AuthProvider><Probe /></AuthProvider>); fireEvent.click(screen.getByText('Login'));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith({ email: 'author@gmail.com', password: 'test-password' }));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});