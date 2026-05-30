import { useState, useEffect, useErrorBoundary } from 'preact/hooks';
import Router from 'preact-router';
import { getProfile, getConfig } from './lib/store';
import { pocketBaseEnabled, isAuthed, onAuthChange } from './lib/pb';
import { NewRx } from './pages/NewRx';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { Login } from './pages/Login';
import { Verify } from './pages/Verify';
import { AuthCallback } from './pages/AuthCallback';
import type { AIProvider } from './lib/gemini';

const PUBLIC_PATHS = ['/verify', '/auth/callback'];

export function App() {
  const [ready, setReady] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showUpdate, setShowUpdate] = useState(false);
  const [error, resetError] = useErrorBoundary();

  useEffect(() => {
    checkSetup();
    const unsubscribeAuth = pocketBaseEnabled ? onAuthChange(() => checkSetup()) : undefined;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Watch for PWA updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setShowUpdate(true);
      });
    }

    return () => {
      unsubscribeAuth?.();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function checkSetup() {
    // Cloud mode: require a signed-in account before anything else.
    if (pocketBaseEnabled && !isAuthed()) {
      setNeedsAuth(true);
      setNeedsOnboarding(false);
      setReady(true);
      return;
    }
    setNeedsAuth(false);

    const [profile, provider, geminiKey, openrouterKey] = await Promise.all([
      getProfile(),
      getConfig<AIProvider>('aiProvider'),
      getConfig<string>('geminiApiKey'),
      getConfig<string>('openrouterApiKey'),
    ]);

    // In cloud mode the server holds the AI key, so only a profile is required.
    // In local mode the doctor must also have configured a BYOK key.
    const selectedProvider = provider || 'gemini';
    const activeKey = selectedProvider === 'openrouter' ? openrouterKey : geminiKey;
    const needsKey = !pocketBaseEnabled && !activeKey;
    if (!profile || needsKey) {
      setNeedsOnboarding(true);
    } else {
      setNeedsOnboarding(false);
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

  const isPublicPath = PUBLIC_PATHS.includes(window.location.pathname);

  if (needsAuth && !isPublicPath) {
    return <Login onAuthed={() => checkSetup()} />;
  }

  if (needsOnboarding && !isPublicPath) {
    return <Onboarding onComplete={() => setNeedsOnboarding(false)} />;
  }

  return (
    <div class="h-full">
      {showUpdate && (
        <div class="bg-blue-600 text-white text-xs py-2 px-4 flex items-center justify-between animate-in slide-in-from-top duration-300">
          <span>New version available!</span>
          <button 
            onClick={() => window.location.reload()} 
            class="bg-white text-blue-600 px-2 py-1 rounded font-bold uppercase tracking-wider"
          >
            Update
          </button>
        </div>
      )}
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
        <AuthCallback path="/auth/callback" />
      </Router>
    </div>
  );
}
