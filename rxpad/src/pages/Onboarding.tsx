import { useState } from 'preact/hooks';
import { route } from 'preact-router';
import { saveProfile, saveConfig } from '../lib/db';
import { generateStamp } from '../lib/stamp';
import { generateHmacSecret } from '../lib/qr';
import { testApiKey } from '../lib/gemini';
import { StampPreview } from '../components/StampPreview';
import type { DoctorProfile } from '../schemas/profile';

export function Onboarding({ path: _path, onComplete }: { path?: string; onComplete?: () => void }) {
  const [step, setStep] = useState(0);

  // API key state
  const [apiKey, setApiKey] = useState('');
  const [apiStatus, setApiStatus] = useState<'untested' | 'testing' | 'valid' | 'invalid'>('untested');

  // Profile state
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');

  // Stamp state
  const [stampBase64, setStampBase64] = useState('');
  const [generatingStamp, setGeneratingStamp] = useState(false);

  async function handleTestKey() {
    if (!apiKey.trim()) return;
    setApiStatus('testing');
    const valid = await testApiKey(apiKey.trim());
    setApiStatus(valid ? 'valid' : 'invalid');
    if (valid) {
      await saveConfig('geminiApiKey', apiKey.trim());
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
    };
    const stamp = await generateStamp(profile);
    profile.stampBase64 = stamp;
    await saveProfile(profile);
    setStampBase64(stamp);
    setGeneratingStamp(false);
    setStep(3);
  }

  const profileValid = fullName.trim() && designation.trim() && regNumber.trim();

  return (
    <div class="min-h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white">
      <div class="w-full max-w-md">
        {/* Progress dots */}
        <div class="flex justify-center gap-2 mb-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              class={`w-2 h-2 rounded-full ${i === step ? 'bg-blue-600' : i < step ? 'bg-blue-300' : 'bg-gray-300'}`}
            />
          ))}
        </div>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div class="text-center">
            <div class="text-5xl mb-4">{'\u211E'}</div>
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Welcome to RxPad</h1>
            <p class="text-gray-600 mb-8">
              Generate professional prescriptions from voice notes in under 90 seconds.
            </p>
            <button
              onClick={() => setStep(1)}
              class="w-full bg-blue-600 text-white py-3 rounded-xl font-medium text-base"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step 1: API Key */}
        {step === 1 && (
          <div>
            <h2 class="text-xl font-bold text-gray-900 mb-2">Connect Gemini AI</h2>
            <p class="text-sm text-gray-600 mb-1">
              RxPad uses Google Gemini to parse your voice notes into structured prescriptions.
            </p>
            <p class="text-sm text-gray-500 mb-4">
              Get a free API key from{' '}
              <a href="https://ai.google.dev" target="_blank" class="text-blue-600 underline">
                ai.google.dev
              </a>
            </p>
            <input
              type="password"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Paste your Gemini API key"
              value={apiKey}
              onInput={(e) => {
                setApiKey((e.target as HTMLInputElement).value);
                setApiStatus('untested');
              }}
            />
            <button
              onClick={handleTestKey}
              disabled={!apiKey.trim() || apiStatus === 'testing'}
              class="w-full bg-gray-100 text-gray-700 py-2 rounded-lg font-medium text-sm disabled:opacity-50 mb-3"
            >
              {apiStatus === 'testing' ? 'Testing connection...' : 'Test Connection'}
            </button>
            {apiStatus === 'valid' && (
              <p class="text-sm text-green-600 mb-3">&#10003; Connected successfully!</p>
            )}
            {apiStatus === 'invalid' && (
              <p class="text-sm text-red-600 mb-3">&#10007; Invalid key. Please check and try again.</p>
            )}
            <div class="flex gap-3 mt-4">
              <button onClick={() => setStep(0)} class="flex-1 text-gray-600 py-2.5 rounded-lg text-sm">
                Back
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={apiStatus !== 'valid'}
                class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium text-sm disabled:bg-gray-300"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Doctor Profile */}
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
              <button onClick={() => setStep(1)} class="flex-1 text-gray-600 py-2.5 rounded-lg text-sm">
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

        {/* Step 3: Stamp Preview */}
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

        {/* Step 4: Done */}
        {step === 4 && (
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
