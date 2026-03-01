import { useState, useEffect } from 'preact/hooks';
import { Shell } from '../components/Shell';
import { StampPreview } from '../components/StampPreview';
import { saveProfile, getProfile, saveConfig, getConfig } from '../lib/db';
import { generateStamp } from '../lib/stamp';
import { generateHmacSecret } from '../lib/qr';
import { testApiKey } from '../lib/gemini';
import type { DoctorProfile } from '../schemas/profile';

export function Settings({ path: _path }: { path?: string }) {
  const [apiKey, setApiKey] = useState('');
  const [apiStatus, setApiStatus] = useState<'untested' | 'testing' | 'valid' | 'invalid'>('untested');

  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [phone, setPhone] = useState('');
  const [stampBase64, setStampBase64] = useState('');
  const [hmacSecret, setHmacSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const key = await getConfig<string>('geminiApiKey');
    if (key) {
      setApiKey(key);
      setApiStatus('valid');
    }
    const profile = await getProfile();
    if (profile) {
      setFullName(profile.fullName);
      setDesignation(profile.designation);
      setRegNumber(profile.regNumber);
      setClinicName(profile.clinicName || '');
      setPhone(profile.phone || '');
      setStampBase64(profile.stampBase64 || '');
      setHmacSecret(profile.hmacSecret || '');
    }
  }

  async function handleTestKey() {
    if (!apiKey.trim()) return;
    setApiStatus('testing');
    const valid = await testApiKey(apiKey.trim());
    if (valid) {
      setApiStatus('valid');
      await saveConfig('geminiApiKey', apiKey.trim());
    } else {
      setApiStatus('invalid');
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
    };

    const stamp = await generateStamp(profile);
    profile.stampBase64 = stamp;

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

        {/* API Key Section */}
        <section class="bg-white rounded-xl border p-4 mb-4">
          <h2 class="font-semibold text-gray-800 mb-3">Gemini API Key</h2>
          <p class="text-xs text-gray-500 mb-3">
            Get a free API key from ai.google.dev. Required for voice and text parsing.
          </p>
          <div class="flex gap-2">
            <input
              type="password"
              class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
              class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium disabled:bg-gray-300 whitespace-nowrap"
            >
              {apiStatus === 'testing' ? 'Testing...' : 'Test'}
            </button>
          </div>
          {apiStatus === 'valid' && (
            <p class="mt-2 text-sm text-green-600 flex items-center gap-1">
              <span>&#10003;</span> API key is valid
            </p>
          )}
          {apiStatus === 'invalid' && (
            <p class="mt-2 text-sm text-red-600 flex items-center gap-1">
              <span>&#10007;</span> Invalid API key. Please check and try again.
            </p>
          )}
        </section>

        {/* Doctor Profile Section */}
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

          <button
            onClick={handleSaveProfile}
            disabled={!profileValid || saving}
            class="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm disabled:bg-gray-300"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
          </button>
        </section>
      </div>
    </Shell>
  );
}
