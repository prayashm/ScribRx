import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { exchangeCode } from '../lib/openrouter';
import { saveConfig } from '../lib/db';

export function AuthCallback({ path: _path }: { path?: string }) {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        if (oauthError) {
          throw new Error(params.get('error_description') || oauthError);
        }

        const code = params.get('code');
        const state = params.get('state');
        if (!code) {
          throw new Error('Missing OAuth code in callback URL.');
        }

        const { accessToken, returnPath } = await exchangeCode({ code, state });
        await saveConfig('openrouterApiKey', accessToken);
        await saveConfig('aiProvider', 'openrouter');

        setStatus('success');
        setTimeout(() => {
          route(returnPath || '/settings', true);
        }, 300);
      } catch (err: any) {
        setStatus('error');
        setError(err?.message || 'Failed to complete OpenRouter sign-in.');
      }
    })();
  }, []);

  return (
    <div class="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div class="bg-white rounded-xl border p-6 max-w-sm w-full text-center">
        {status === 'processing' && (
          <>
            <h1 class="text-lg font-semibold text-gray-900 mb-2">Connecting OpenRouter</h1>
            <p class="text-sm text-gray-600">Completing OAuth sign-in...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 class="text-lg font-semibold text-green-700 mb-2">Connected</h1>
            <p class="text-sm text-gray-600">Redirecting back to ScribRx...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 class="text-lg font-semibold text-red-600 mb-2">Connection failed</h1>
            <p class="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => route('/settings', true)}
              class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium"
            >
              Go to Settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}
