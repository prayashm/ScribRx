import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { saveProfile, saveConfig, getConfig, getProfile } from '../lib/store';
import { generateStamp } from '../lib/stamp';
import { generateSignature } from '../lib/signature';
import { generateHmacSecret } from '../lib/qr';
import { testApiKey, type AIProvider } from '../lib/gemini';
import { startOAuthFlow, testOpenRouterKey } from '../lib/openrouter';
import { StampPreview } from '../components/StampPreview';
import { SignaturePreview, SignatureSelector } from '../components/SignaturePreview';
import { pocketBaseEnabled } from '../lib/pb';
import type { DoctorProfile } from '../schemas/profile';
import type { SignatureFont, SignatureStyle } from '../lib/signature';

export function Onboarding({ path: _path, onComplete }: { path?: string; onComplete?: () => void }) {
  const [step, setStep] = useState(0);

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
  const [generatingStamp, setGeneratingStamp] = useState(false);

  const [signatureFont, setSignatureFont] = useState<SignatureFont>('Dancing Script');
  const [signatureStyle, setSignatureStyle] = useState<SignatureStyle>('fullName');
  const [savingSignature, setSavingSignature] = useState(false);

  useEffect(() => {
    (async () => {
      const [savedProvider, savedGemini, savedOpenRouter] = await Promise.all([
        getConfig<AIProvider>('aiProvider'),
        getConfig<string>('geminiApiKey'),
        getConfig<string>('openrouterApiKey'),
      ]);

      if (savedProvider) setProvider(savedProvider);
      if (savedGemini) {
        setGeminiApiKey(savedGemini);
        setGeminiStatus('valid');
      }
      if (savedOpenRouter) {
        setOpenrouterApiKey(savedOpenRouter);
        setOpenrouterStatus('valid');
      }
    })();
  }, []);

  async function handleProviderChange(nextProvider: AIProvider) {
    setProvider(nextProvider);
    await saveConfig('aiProvider', nextProvider);
  }

  async function handleTestGeminiKey() {
    if (!geminiApiKey.trim()) return;
    setProviderError('');
    setGeminiStatus('testing');
    const valid = await testApiKey('gemini', geminiApiKey.trim());
    setGeminiStatus(valid ? 'valid' : 'invalid');
    if (valid) {
      await saveConfig('geminiApiKey', geminiApiKey.trim());
      await saveConfig('aiProvider', 'gemini');
      setProvider('gemini');
    }
  }

  async function handleTestOpenRouterKey() {
    if (!openrouterApiKey.trim()) return;
    setProviderError('');
    setOpenrouterStatus('testing');
    const valid = await testOpenRouterKey(openrouterApiKey.trim());
    setOpenrouterStatus(valid ? 'valid' : 'invalid');
    if (valid) {
      await saveConfig('openrouterApiKey', openrouterApiKey.trim());
      await saveConfig('aiProvider', 'openrouter');
      setProvider('openrouter');
    }
  }

  async function handleConnectOpenRouter() {
    try {
      setProviderError('');
      await startOAuthFlow({
        redirectUri: `${window.location.origin}/auth/callback`,
        returnPath: '/onboarding',
      });
    } catch (err: any) {
      setProviderError(err?.message || 'Failed to start OpenRouter sign-in.');
    }
  }

  async function handleProfileNext() {
    setGeneratingStamp(true);
    const profile: DoctorProfile = {
      fullName: fullName.trim(),
      designation: designation.trim(),
      regNumber: regNumber.trim(),
      clinicName: clinicName.trim() || undefined,
      phone: phone.trim() || undefined,
      hmacSecret: generateHmacSecret(),
      signatureFont,
      signatureStyle,
    };
    const stamp = await generateStamp(profile);
    profile.stampBase64 = stamp;
    const sig = await generateSignature(profile);
    profile.signatureBase64 = sig;
    await saveProfile(profile);
    setStampBase64(stamp);
    setGeneratingStamp(false);
    setStep(3);
  }

  async function handleSignatureSave() {
    setSavingSignature(true);
    const existing = await getProfile();
    if (existing) {
      existing.signatureFont = signatureFont;
      existing.signatureStyle = signatureStyle;
      const sig = await generateSignature(existing);
      existing.signatureBase64 = sig;
      await saveProfile(existing);
    }
    setSavingSignature(false);
    setStep(5);
  }

  const profileValid = fullName.trim() && designation.trim() && regNumber.trim();
  const providerReady = provider === 'gemini' ? geminiStatus === 'valid' : openrouterStatus === 'valid';

  return (
    <div class="min-h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white">
      <div class="w-full max-w-md">
        <div class="flex justify-center gap-2 mb-8">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              class={`w-2 h-2 rounded-full ${i === step ? 'bg-blue-600' : i < step ? 'bg-blue-300' : 'bg-gray-300'}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div class="text-center">
            <div class="text-5xl mb-4">{'\u211E'}</div>
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Welcome to RxPad</h1>
            <p class="text-gray-600 mb-8">
              Generate professional prescriptions from voice notes in under 90 seconds.
            </p>
            <button
              onClick={() => setStep(pocketBaseEnabled ? 2 : 1)}
              class="w-full bg-blue-600 text-white py-3 rounded-xl font-medium text-base"
            >
              Get Started
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 class="text-xl font-bold text-gray-900 mb-2">Choose AI Provider</h2>
            <p class="text-sm text-gray-600 mb-4">
              Connect either Gemini BYOK or OpenRouter OAuth/BYOK for voice and text parsing.
            </p>

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
                <p class="text-sm text-gray-500 mb-3">
                  Get a free key from{' '}
                  <a href="https://ai.google.dev" target="_blank" class="text-blue-600 underline">
                    ai.google.dev
                  </a>
                </p>
                <input
                  type="password"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                  class="w-full bg-gray-100 text-gray-700 py-2 rounded-lg font-medium text-sm disabled:opacity-50 mb-3"
                >
                  {geminiStatus === 'testing' ? 'Testing connection...' : 'Test Connection'}
                </button>
                {geminiStatus === 'valid' && (
                  <p class="text-sm text-green-600 mb-3">&#10003; Connected successfully!</p>
                )}
                {geminiStatus === 'invalid' && (
                  <p class="text-sm text-red-600 mb-3">&#10007; Invalid key. Please check and try again.</p>
                )}
              </>
            )}

            {provider === 'openrouter' && (
              <>
                <button
                  onClick={handleConnectOpenRouter}
                  class="w-full bg-blue-600 text-white py-2 rounded-lg font-medium text-sm mb-3"
                >
                  Connect with OpenRouter OAuth
                </button>
                <input
                  type="password"
                  class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Or paste OpenRouter API key"
                  value={openrouterApiKey}
                  onInput={(e) => {
                    setOpenrouterApiKey((e.target as HTMLInputElement).value);
                    setOpenrouterStatus('untested');
                  }}
                />
                <button
                  onClick={handleTestOpenRouterKey}
                  disabled={!openrouterApiKey.trim() || openrouterStatus === 'testing'}
                  class="w-full bg-gray-100 text-gray-700 py-2 rounded-lg font-medium text-sm disabled:opacity-50 mb-3"
                >
                  {openrouterStatus === 'testing' ? 'Testing connection...' : 'Test Connection'}
                </button>
                {openrouterStatus === 'valid' && (
                  <p class="text-sm text-green-600 mb-3">&#10003; Connected successfully!</p>
                )}
                {openrouterStatus === 'invalid' && (
                  <p class="text-sm text-red-600 mb-3">&#10007; Invalid key. Please check and try again.</p>
                )}
              </>
            )}

            {providerError && <p class="text-sm text-red-600 mb-3">{providerError}</p>}

            <div class="flex gap-3 mt-4">
              <button onClick={() => setStep(0)} class="flex-1 text-gray-600 py-2.5 rounded-lg text-sm">
                Back
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!providerReady}
                class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:bg-gray-300"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 class="text-xl font-bold text-gray-900 mb-2">Your Profile</h2>
            <p class="text-sm text-gray-600 mb-4">This information appears on every prescription you generate.</p>
            <div class="space-y-3">
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Full Name *"
                value={fullName}
                onInput={(e) => setFullName((e.target as HTMLInputElement).value)}
              />
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Designation * (e.g. MBBS, MD)"
                value={designation}
                onInput={(e) => setDesignation((e.target as HTMLInputElement).value)}
              />
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Registration No. * (e.g. MH-12345)"
                value={regNumber}
                onInput={(e) => setRegNumber((e.target as HTMLInputElement).value)}
              />
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Clinic Name (optional)"
                value={clinicName}
                onInput={(e) => setClinicName((e.target as HTMLInputElement).value)}
              />
              <input
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Phone (optional)"
                value={phone}
                onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="flex gap-3 mt-4">
              <button onClick={() => setStep(pocketBaseEnabled ? 0 : 1)} class="flex-1 text-gray-600 py-2.5 rounded-lg text-sm">
                Back
              </button>
              <button
                onClick={handleProfileNext}
                disabled={!profileValid || generatingStamp}
                class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:bg-gray-300"
              >
                {generatingStamp ? 'Generating stamp...' : 'Next'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div class="text-center">
            <h2 class="text-xl font-bold text-gray-900 mb-2">Your Stamp</h2>
            <p class="text-sm text-gray-600 mb-4">
              This stamp will appear on your prescriptions. You can change it in Settings.
            </p>
            {stampBase64 && <StampPreview base64={stampBase64} />}
            <div class="flex gap-3 mt-4">
              <button onClick={() => setStep(2)} class="flex-1 text-gray-600 py-2.5 rounded-lg text-sm">
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm"
              >
                Looks good!
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 class="text-xl font-bold text-gray-900 mb-2">Your Signature</h2>
            <p class="text-sm text-gray-600 mb-4">
              Choose a handwriting style for your prescription signature.
            </p>
            <SignatureSelector
              selectedFont={signatureFont}
              selectedStyle={signatureStyle}
              onFontChange={setSignatureFont}
              onStyleChange={setSignatureStyle}
              fullName={fullName}
            />
            <div class="mt-4">
              <SignaturePreview fullName={fullName} font={signatureFont} style={signatureStyle} />
            </div>
            <div class="flex gap-3 mt-4">
              <button onClick={() => setStep(3)} class="flex-1 text-gray-600 py-2.5 rounded-lg text-sm">
                Back
              </button>
              <button
                onClick={handleSignatureSave}
                disabled={savingSignature}
                class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:bg-gray-300"
              >
                {savingSignature ? 'Saving...' : 'Looks good!'}
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div class="text-center">
            <div class="text-5xl mb-4">&#10003;</div>
            <h2 class="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
            <p class="text-gray-600 mb-8">Start creating prescriptions with voice or text.</p>
            <button
              onClick={() => { if (onComplete) onComplete(); route('/'); }}
              class="w-full bg-blue-600 text-white py-3 rounded-xl font-medium text-base"
            >
              Create First Prescription
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
