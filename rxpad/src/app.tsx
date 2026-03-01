import { useState, useEffect, useErrorBoundary } from 'preact/hooks';
import Router from 'preact-router';
import { getProfile, getConfig } from './lib/db';
import { NewRx } from './pages/NewRx';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { Verify } from './pages/Verify';

export function App() {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [error, resetError] = useErrorBoundary();

  useEffect(() => {
    checkSetup();
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function checkSetup() {
    const profile = await getProfile();
    const apiKey = await getConfig<string>('geminiApiKey');
    if (!profile || !apiKey) {
      setNeedsOnboarding(true);
    }
    setReady(true);
  }

  if (error) {
    return (
      <div class="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div class="bg-white rounded-xl border p-6 max-w-sm w-full text-center">
          <h1 class="text-lg font-semibold text-red-600 mb-2">Something went wrong</h1>
          <p class="text-sm text-gray-600 mb-4">{String(error)}</p>
          <button
            onClick={() => { resetError(); window.location.reload(); }}
            class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div class="min-h-screen flex items-center justify-center bg-white">
        <div class="text-center">
          <div class="text-4xl mb-2">{'\u211E'}</div>
          <p class="text-sm text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (needsOnboarding && window.location.pathname !== '/verify') {
    return <Onboarding />;
  }

  return (
    <div class="h-full">
      {isOffline && (
        <div class="bg-amber-50 border-b border-amber-200 text-amber-700 text-xs text-center py-1.5 px-4">
          You're offline. Voice/text parsing unavailable. Manual entry still works.
        </div>
      )}
      <Router>
        <NewRx path="/" />
        <History path="/history" />
        <Settings path="/settings" />
        <Onboarding path="/onboarding" />
        <Verify path="/verify" />
      </Router>
    </div>
  );
}
