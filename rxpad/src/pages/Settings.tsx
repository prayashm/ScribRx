import { useState, useEffect } from 'preact/hooks';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { Shell } from '../components/Shell';
import { StampPreview } from '../components/StampPreview';
import { SignaturePreview, SignatureSelector } from '../components/SignaturePreview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { saveProfile, getProfile, saveConfig, getConfig, resetDB } from '../lib/db';
import { generateStamp } from '../lib/stamp';
import { generateSignature } from '../lib/signature';
import { generateHmacSecret } from '../lib/qr';
import { testApiKey, type AIProvider } from '../lib/gemini';
import { startOAuthFlow, testOpenRouterKey } from '../lib/openrouter';
import type { DoctorProfile } from '../schemas/profile';
import type { SignatureFont, SignatureStyle } from '../lib/signature';

export function Settings({ path: _path }: { path?: string }) {
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [geminiStatus, setGeminiStatus] = useState<'untested' | 'testing' | 'valid' | 'invalid'>('untested');
  const [openrouterStatus, setOpenrouterStatus] = useState<'untested' | 'testing' | 'valid' | 'invalid'>('untested');
  const [providerError, setProviderError] = useState('');

  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [stampBase64, setStampBase64] = useState('');
  const [hmacSecret, setHmacSecret] = useState('');
  const [signatureFont, setSignatureFont] = useState<SignatureFont>('Dancing Script');
  const [signatureStyle, setSignatureStyle] = useState<SignatureStyle>('fullName');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const { canInstall, isInstalled, install } = useInstallPrompt();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [savedProvider, geminiKey, openrouterKey, profile] = await Promise.all([
      getConfig<AIProvider>('aiProvider'),
      getConfig<string>('geminiApiKey'),
      getConfig<string>('openrouterApiKey'),
      getProfile(),
    ]);

    if (savedProvider) setProvider(savedProvider);
    if (geminiKey) {
      setGeminiApiKey(geminiKey);
      setGeminiStatus('valid');
    }
    if (openrouterKey) {
      setOpenrouterApiKey(openrouterKey);
      setOpenrouterStatus('valid');
    }

    if (profile) {
      setFullName(profile.fullName);
      setDesignation(profile.designation);
      setRegNumber(profile.regNumber);
      setClinicName(profile.clinicName || '');
      setPhone(profile.phone || '');
      setStampBase64(profile.stampBase64 || '');
      setHmacSecret(profile.hmacSecret || '');
      setSignatureFont(profile.signatureFont || 'Dancing Script');
      setSignatureStyle(profile.signatureStyle || 'fullName');
    }
  }

  async function handleProviderChange(nextProvider: AIProvider) {
    setProvider(nextProvider);
    await saveConfig('aiProvider', nextProvider);
  }

  async function handleTestGeminiKey() {
    if (!geminiApiKey.trim()) return;
    setProviderError('');
    setGeminiStatus('testing');
    const valid = await testApiKey('gemini', geminiApiKey.trim());
    if (valid) {
      setGeminiStatus('valid');
      await saveConfig('geminiApiKey', geminiApiKey.trim());
      await saveConfig('aiProvider', 'gemini');
      setProvider('gemini');
    } else {
      setGeminiStatus('invalid');
    }
  }

  async function handleTestOpenRouterKey() {
    if (!openrouterApiKey.trim()) return;
    setProviderError('');
    setOpenrouterStatus('testing');
    const valid = await testOpenRouterKey(openrouterApiKey.trim());
    if (valid) {
      setOpenrouterStatus('valid');
      await saveConfig('openrouterApiKey', openrouterApiKey.trim());
      await saveConfig('aiProvider', 'openrouter');
      setProvider('openrouter');
    } else {
      setOpenrouterStatus('invalid');
    }
  }

  async function handleConnectOpenRouter() {
    try {
      setProviderError('');
      await startOAuthFlow({
        redirectUri: `${window.location.origin}/auth/callback`,
        returnPath: '/settings',
      });
    } catch (err: any) {
      setProviderError(err?.message || 'Failed to start OpenRouter sign-in.');
    }
  }

  async function handleSaveProfile() {
    if (!fullName.trim() || !designation.trim() || !regNumber.trim()) return;
    setSaving(true);

    const secret = hmacSecret || generateHmacSecret();
    const profile: DoctorProfile = {
      fullName: fullName.trim(),
      designation: designation.trim(),
      regNumber: regNumber.trim(),
      clinicName: clinicName.trim() || undefined,
      phone: phone.trim() || undefined,
      hmacSecret: secret,
      signatureFont,
      signatureStyle,
    };

    const stamp = await generateStamp(profile);
    profile.stampBase64 = stamp;

    const sig = await generateSignature(profile);
    profile.signatureBase64 = sig;

    await saveProfile(profile);
    setStampBase64(stamp);
    setHmacSecret(secret);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const profileValid = fullName.trim() && designation.trim() && regNumber.trim();

  return (
    <Shell activeTab="/settings">
      <div class="p-4 max-w-lg mx-auto">
        <h1 class="text-xl font-bold text-gray-900 mb-6">Settings</h1>

        <section class="bg-white rounded-xl border p-4 mb-4">
          <h2 class="font-semibold text-gray-800 mb-3">AI Provider</h2>

          <div class="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => handleProviderChange('gemini')}
              class={`px-3 py-2 rounded-lg text-sm font-medium border ${provider === 'gemini' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              Gemini
            </button>
            <button
              onClick={() => handleProviderChange('openrouter')}
              class={`px-3 py-2 rounded-lg text-sm font-medium border ${provider === 'openrouter' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              OpenRouter
            </button>
          </div>

          {provider === 'gemini' && (
            <>
              <p class="text-xs text-gray-500 mb-3">Get a free API key from ai.google.dev. Required for voice and text parsing.</p>
              <div class="flex gap-2">
                <input
                  type="password"
                  class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Paste your Gemini API key"
                  value={geminiApiKey}
                  onInput={(e) => {
                    setGeminiApiKey((e.target as HTMLInputElement).value);
                    setGeminiStatus('untested');
                  }}
                />
                <button
                  onClick={handleTestGeminiKey}
                  disabled={!geminiApiKey.trim() || geminiStatus === 'testing'}
                  class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium disabled:bg-gray-300 whitespace-nowrap"
                >
                  {geminiStatus === 'testing' ? 'Testing...' : 'Test'}
                </button>
              </div>
              {geminiStatus === 'valid' && (
                <p class="mt-2 text-sm text-green-600 flex items-center gap-1">
                  <span>&#10003;</span> API key is valid
                </p>
              )}
              {geminiStatus === 'invalid' && (
                <p class="mt-2 text-sm text-red-600 flex items-center gap-1">
                  <span>&#10007;</span> Invalid API key. Please check and try again.
                </p>
              )}
            </>
          )}

          {provider === 'openrouter' && (
            <>
              <p class="text-xs text-gray-500 mb-3">Connect with OpenRouter OAuth or paste an OpenRouter API key.</p>
              <button
                onClick={handleConnectOpenRouter}
                class="w-full mb-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium"
              >
                Connect with OpenRouter OAuth
              </button>
              <div class="flex gap-2">
                <input
                  type="password"
                  class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Paste your OpenRouter API key"
                  value={openrouterApiKey}
                  onInput={(e) => {
                    setOpenrouterApiKey((e.target as HTMLInputElement).value);
                    setOpenrouterStatus('untested');
                  }}
                />
                <button
                  onClick={handleTestOpenRouterKey}
                  disabled={!openrouterApiKey.trim() || openrouterStatus === 'testing'}
                  class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium disabled:bg-gray-300 whitespace-nowrap"
                >
                  {openrouterStatus === 'testing' ? 'Testing...' : 'Test'}
                </button>
              </div>
              {openrouterStatus === 'valid' && (
                <p class="mt-2 text-sm text-green-600 flex items-center gap-1">
                  <span>&#10003;</span> OpenRouter key is valid
                </p>
              )}
              {openrouterStatus === 'invalid' && (
                <p class="mt-2 text-sm text-red-600 flex items-center gap-1">
                  <span>&#10007;</span> Invalid OpenRouter key. Please check and try again.
                </p>
              )}
            </>
          )}

          {providerError && <p class="mt-2 text-sm text-red-600">{providerError}</p>}
        </section>

        <section class="bg-white rounded-xl border p-4">
          <h2 class="font-semibold text-gray-800 mb-3">Doctor Profile</h2>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Dr. Priya Sharma"
                value={fullName}
                onInput={(e) => setFullName((e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Designation *</label>
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="MBBS, MD (General Medicine)"
                value={designation}
                onInput={(e) => setDesignation((e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Registration Number *</label>
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="MH-12345"
                value={regNumber}
                onInput={(e) => setRegNumber((e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Clinic Name</label>
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="City Hospital, Mumbai"
                value={clinicName}
                onInput={(e) => setClinicName((e.target as HTMLInputElement).value)}
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="+91 98765 43210"
                value={phone}
                onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>

          {stampBase64 && (
            <div class="mt-4 border-t pt-4">
              <h3 class="text-xs font-medium text-gray-600 mb-2">Stamp Preview</h3>
              <StampPreview base64={stampBase64} />
            </div>
          )}

          {fullName.trim() && (
            <div class="mt-4 border-t pt-4">
              <h3 class="text-xs font-medium text-gray-600 mb-3">Signature</h3>
              <SignatureSelector
                selectedFont={signatureFont}
                selectedStyle={signatureStyle}
                onFontChange={setSignatureFont}
                onStyleChange={setSignatureStyle}
                fullName={fullName}
              />
              <div class="mt-3">
                <SignaturePreview fullName={fullName} font={signatureFont} style={signatureStyle} />
              </div>
            </div>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={!profileValid || saving}
            class="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm disabled:bg-gray-300"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
          </button>
        </section>

        {canInstall && !isInstalled && (
          <section class="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-4">
            <div class="flex items-center gap-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <div class="flex-1">
                <p class="text-sm font-semibold text-blue-900">Install ScribRx</p>
                <p class="text-xs text-blue-700">Add to home screen for quick access &amp; offline use</p>
              </div>
              <button
                onClick={install}
                class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Install
              </button>
            </div>
          </section>
        )}

        {isInstalled && (
          <section class="bg-green-50 rounded-xl border border-green-200 p-4 mb-4">
            <p class="text-sm text-green-800 text-center">✓ App installed on your device</p>
          </section>
        )}

        <section class="mt-8 pt-4 border-t">
          <h2 class="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3 px-1">Danger Zone</h2>
          <div class="bg-red-50 rounded-xl border border-red-100 p-4">
            <p class="text-xs text-red-700 mb-3">
              Delete all prescriptions, profile settings, and API keys. This action is permanent and cannot be undone.
            </p>
            <button
              onClick={() => setShowResetConfirm(true)}
              class="w-full bg-white text-red-600 border border-red-200 py-2.5 rounded-lg font-medium text-sm hover:bg-red-50 transition-colors"
            >
              Reset All App Data
            </button>
          </div>
        </section>

        {showResetConfirm && (
          <ConfirmDialog
            title="Delete Everything?"
            message="This will permanently delete all your prescriptions and profile from this device. You will need to complete the onboarding process again."
            confirmLabel="Yes, Delete Everything"
            destructive
            onConfirm={async () => {
              await resetDB();
              window.location.href = '/onboarding';
            }}
            onCancel={() => setShowResetConfirm(false)}
          />
        )}
      </div>
    </Shell>
  );
}
