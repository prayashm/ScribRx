import { useState } from 'preact/hooks';
import { pb } from '../lib/pb';

/**
 * Account sign-in / sign-up for the cloud-enabled build. Only shown when a
 * PocketBase backend is configured. On success, `pb.authStore` updates and the
 * app re-renders via its `onAuthChange` subscription.
 */
export function Login({ onAuthed }: { onAuthed?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (password !== passwordConfirm) throw new Error('Passwords do not match.');
        await pb.collection('users').create({ email, password, passwordConfirm });
      }
      await pb.collection('users').authWithPassword(email, password);
      onAuthed?.();
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Check your details and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    try {
      await pb.collection('users').authWithOAuth2({ provider: 'google' });
      onAuthed?.();
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="min-h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white">
      <div class="w-full max-w-sm">
        <div class="text-center mb-8">
          <div class="text-5xl mb-3">{'℞'}</div>
          <h1 class="text-2xl font-bold text-gray-900">
            {mode === 'signin' ? 'Sign in to ScribRx' : 'Create your ScribRx account'}
          </h1>
          <p class="text-sm text-gray-600 mt-2">
            Your prescriptions and profile sync securely across your devices.
          </p>
        </div>

        <button
          onClick={handleGoogle}
          disabled={busy}
          class="w-full mb-4 flex items-center justify-center gap-2 border border-gray-300 bg-white text-gray-700 py-2.5 rounded-xl font-medium text-sm disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95L3.97 7.28C4.68 5.16 6.66 3.58 9 3.58z" />
          </svg>
          Continue with Google
        </button>

        <div class="flex items-center gap-3 mb-4">
          <div class="flex-1 h-px bg-gray-200" />
          <span class="text-xs text-gray-400">or</span>
          <div class="flex-1 h-px bg-gray-200" />
        </div>

        <form onSubmit={handleSubmit} class="space-y-3">
          <input
            type="email"
            required
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Email"
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          />
          <input
            type="password"
            required
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
          {mode === 'signup' && (
            <input
              type="password"
              required
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Confirm password"
              value={passwordConfirm}
              onInput={(e) => setPasswordConfirm((e.target as HTMLInputElement).value)}
            />
          )}

          {error && <p class="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            class="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:bg-gray-300"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p class="text-center text-sm text-gray-600 mt-5">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
            class="text-blue-600 font-medium"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
