import { useState, useEffect } from 'preact/hooks';
import { Shell } from '../components/Shell';
import { MedicineRow } from '../components/MedicineRow';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  getNextRxId,
  savePrescription,
  getProfile,
  getConfig,
} from '../lib/db';
import { generatePrescriptionPDF } from '../lib/pdf';
import { signPrescription, generateQRCode } from '../lib/qr';
import { parsePrescriptionUpdate } from '../lib/gemini';
import type { Medicine, Prescription, PrescriptionDraft } from '../schemas/prescription';
import type { DoctorProfile } from '../schemas/profile';

const emptyMedicine = (): Medicine => ({
  name: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
});

interface Props {
  path?: string;
  editDraft?: Prescription;
}

export function NewRx({ editDraft }: Props) {
  // Patient fields
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState<'M' | 'F' | 'Other'>('M');

  // Medicines
  const [medicines, setMedicines] = useState<Medicine[]>([emptyMedicine()]);

  // Lab tests
  const [labTests, setLabTests] = useState<string[]>([]);
  const [labTestInput, setLabTestInput] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  // AI text input
  const [textInput, setTextInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Finalize state
  const [showConfirm, setShowConfirm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState<{ rx: Prescription; blob: Blob } | null>(null);

  // Profile + API key
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    (async () => {
      setProfile(await getProfile());
      const key = await getConfig<string>('geminiApiKey');
      if (key) setApiKey(key);
    })();
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load edit draft
  useEffect(() => {
    if (editDraft) {
      setPatientName(editDraft.patient.name);
      setPatientAge(String(editDraft.patient.age));
      setPatientGender(editDraft.patient.gender);
      setMedicines(editDraft.medicines);
      setLabTests(editDraft.labTests);
      setNotes(editDraft.notes || '');
    }
  }, [editDraft]);

  function getCurrentDraft(): PrescriptionDraft | null {
    if (!patientName && medicines.length === 1 && !medicines[0].name) return null;
    return {
      patient: {
        name: patientName,
        age: parseInt(patientAge) || 0,
        gender: patientGender,
      },
      medicines: medicines.filter((m) => m.name),
      lab_tests: labTests,
      notes: notes || undefined,
    };
  }

  function applyDraft(draft: PrescriptionDraft) {
    setPatientName(draft.patient.name);
    setPatientAge(String(draft.patient.age));
    setPatientGender(draft.patient.gender);
    setMedicines(draft.medicines.length > 0 ? draft.medicines : [emptyMedicine()]);
    setLabTests(draft.lab_tests || []);
    if (draft.notes) setNotes(draft.notes);
  }

  async function handleVoiceResult(audio: { base64: string; mimeType: string }) {
    if (!apiKey) {
      setAiError('API key not configured. Go to Settings.');
      return;
    }
    if (!isOnline) {
      setAiError('Voice parsing requires internet. Use manual entry.');
      return;
    }
    setAiLoading(true);
    setAiError('');
    try {
      const result = await parsePrescriptionUpdate(apiKey, getCurrentDraft(), {
        type: 'audio',
        data: audio.base64,
        mimeType: audio.mimeType,
      });
      applyDraft(result);
    } catch (err: any) {
      setAiError(err?.message?.includes('401') ? 'API key invalid. Check Settings.' : 'Failed to parse voice. Please try again or enter manually.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleTextSubmit() {
    if (!textInput.trim() || !apiKey) return;
    if (!isOnline) {
      setAiError('Text parsing requires internet. Enter details manually.');
      return;
    }
    setAiLoading(true);
    setAiError('');
    try {
      const result = await parsePrescriptionUpdate(apiKey, getCurrentDraft(), {
        type: 'text',
        text: textInput.trim(),
      });
      applyDraft(result);
      setTextInput('');
    } catch (err: any) {
      setAiError(err?.message?.includes('401') ? 'API key invalid. Check Settings.' : 'Failed to parse text. Please try again.');
    } finally {
      setAiLoading(false);
    }
  }

  function addMedicine() {
    setMedicines([...medicines, emptyMedicine()]);
  }

  function updateMedicine(i: number, updated: Medicine) {
    const copy = [...medicines];
    copy[i] = updated;
    setMedicines(copy);
  }

  function removeMedicine(i: number) {
    if (medicines.length <= 1) return;
    setMedicines(medicines.filter((_, idx) => idx !== i));
  }

  function addLabTest() {
    if (!labTestInput.trim()) return;
    setLabTests([...labTests, labTestInput.trim()]);
    setLabTestInput('');
  }

  function removeLabTest(i: number) {
    setLabTests(labTests.filter((_, idx) => idx !== i));
  }

  const canFinalize =
    patientName.trim() &&
    patientAge &&
    parseInt(patientAge) > 0 &&
    medicines.some((m) => m.name.trim());

  async function handleFinalize() {
    if (!profile) return;
    setFinalizing(true);
    setShowConfirm(false);

    try {
      const rxId = await getNextRxId();
      const now = new Date().toISOString();

      const rx: Prescription = {
        id: rxId,
        status: 'finalized',
        createdAt: now,
        finalizedAt: now,
        patient: {
          name: patientName.trim(),
          age: parseInt(patientAge),
          gender: patientGender,
        },
        medicines: medicines.filter((m) => m.name.trim()),
        labTests,
        notes: notes.trim() || undefined,
      };

      // Sign + QR
      const qrPayload = await signPrescription(rx, profile);
      rx.qrPayload = qrPayload;
      const qrDataUrl = await generateQRCode(qrPayload);

      // PDF
      const blob = await generatePrescriptionPDF(rx, profile, qrDataUrl);
      rx.pdfBlob = blob;

      await savePrescription(rx);
      setFinalized({ rx, blob });
    } catch (err) {
      console.error('Finalize error:', err);
      setAiError('Failed to finalize prescription. Please try again.');
    } finally {
      setFinalizing(false);
    }
  }

  async function handleShare() {
    if (!finalized) return;
    const { rx, blob } = finalized;
    const file = new File([blob], `${rx.id}.pdf`, { type: 'application/pdf' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: rx.id });
      } catch {
        // user cancelled share — that's fine
      }
    } else {
      downloadPDF(blob, rx.id);
    }
  }

  function handleDownload() {
    if (!finalized) return;
    downloadPDF(finalized.blob, finalized.rx.id);
  }

  function downloadPDF(blob: Blob, rxId: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rxId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetForm() {
    setPatientName('');
    setPatientAge('');
    setPatientGender('M');
    setMedicines([emptyMedicine()]);
    setLabTests([]);
    setLabTestInput('');
    setNotes('');
    setTextInput('');
    setAiError('');
    setFinalized(null);
  }

  // ── Post-finalize view ──
  if (finalized) {
    return (
      <Shell activeTab="/">
        <div class="p-4 max-w-lg mx-auto text-center">
          <div class="text-5xl mb-3">&#10003;</div>
          <h2 class="text-xl font-bold text-gray-900 mb-1">Prescription Ready</h2>
          <p class="text-sm text-gray-500 mb-6">{finalized.rx.id}</p>

          <div class="flex flex-col gap-3 max-w-xs mx-auto">
            <button
              onClick={handleShare}
              class="w-full bg-green-600 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
              </svg>
              Share via WhatsApp
            </button>
            <button
              onClick={handleDownload}
              class="w-full bg-blue-600 text-white py-3 rounded-xl font-medium"
            >
              Download PDF
            </button>
            <button
              onClick={resetForm}
              class="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-medium"
            >
              New Prescription
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell activeTab="/">
      <div class="p-4 max-w-lg mx-auto">
        <h1 class="text-xl font-bold text-gray-900 mb-4">New Prescription</h1>

        {/* AI Input Section */}
        <section class="bg-blue-50 rounded-xl p-4 mb-4 border border-blue-100">
          <p class="text-xs text-blue-700 font-medium mb-2">Voice or Text Input (AI-powered)</p>
          <VoiceRecorder onResult={handleVoiceResult} disabled={aiLoading || !apiKey} />
          <div class="flex gap-2 mt-2">
            <input
              class="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="e.g. Add CBC test, change dose to 500mg..."
              value={textInput}
              onInput={(e) => setTextInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
              disabled={aiLoading}
            />
            <button
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || aiLoading || !apiKey}
              class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium disabled:bg-gray-300"
            >
              Send
            </button>
          </div>
          {aiLoading && (
            <p class="text-xs text-blue-600 mt-2 animate-pulse">Processing with AI...</p>
          )}
          {aiError && (
            <p class="text-xs text-red-600 mt-2">{aiError}</p>
          )}
          {!apiKey && (
            <p class="text-xs text-amber-600 mt-2">API key not set. Configure in Settings to use AI features.</p>
          )}
        </section>

        {/* Patient Info */}
        <section class="bg-white rounded-xl border p-4 mb-4">
          <h2 class="font-semibold text-gray-800 mb-3">Patient Details</h2>
          <div class="space-y-3">
            <input
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Patient Name *"
              value={patientName}
              onInput={(e) => setPatientName((e.target as HTMLInputElement).value)}
            />
            <div class="flex gap-3">
              <input
                class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                type="number"
                placeholder="Age *"
                value={patientAge}
                onInput={(e) => setPatientAge((e.target as HTMLInputElement).value)}
              />
              <select
                class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={patientGender}
                onChange={(e) => setPatientGender((e.target as HTMLSelectElement).value as 'M' | 'F' | 'Other')}
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </section>

        {/* Medicines */}
        <section class="mb-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-semibold text-gray-800">{'\u211E'} Medicines</h2>
            <button onClick={addMedicine} class="text-blue-600 text-sm font-medium">
              + Add Medicine
            </button>
          </div>
          <div class="space-y-3">
            {medicines.map((med, i) => (
              <MedicineRow
                key={i}
                index={i}
                medicine={med}
                onChange={(updated) => updateMedicine(i, updated)}
                onRemove={() => removeMedicine(i)}
              />
            ))}
          </div>
        </section>

        {/* Lab Tests */}
        <section class="bg-white rounded-xl border p-4 mb-4">
          <h2 class="font-semibold text-gray-800 mb-3">Lab Tests</h2>
          <div class="flex gap-2 mb-2">
            <input
              class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="e.g. CBC, LFT, HbA1c"
              value={labTestInput}
              onInput={(e) => setLabTestInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && addLabTest()}
            />
            <button
              onClick={addLabTest}
              disabled={!labTestInput.trim()}
              class="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg font-medium disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {labTests.length > 0 && (
            <div class="flex flex-wrap gap-2">
              {labTests.map((test, i) => (
                <span key={i} class="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">
                  {test}
                  <button onClick={() => removeLabTest(i)} class="text-gray-400 hover:text-red-500 ml-1">
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Notes */}
        <section class="bg-white rounded-xl border p-4 mb-4">
          <h2 class="font-semibold text-gray-800 mb-3">Advice / Notes</h2>
          <textarea
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            rows={3}
            placeholder="e.g. Rest for 3 days, Review after 1 week"
            value={notes}
            onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
          />
        </section>

        {/* Actions */}
        <div class="flex gap-3 mb-4">
          <button
            onClick={resetForm}
            class="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm"
          >
            Clear
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!canFinalize || finalizing}
            class="flex-2 bg-blue-600 text-white py-3 rounded-xl font-medium text-sm disabled:bg-gray-300 flex-grow-[2]"
          >
            {finalizing ? 'Finalizing...' : 'Finalize Prescription'}
          </button>
        </div>

        {showConfirm && (
          <ConfirmDialog
            title="Finalize Prescription"
            message="Once finalized, this prescription cannot be edited. It can only be cancelled. Are you sure?"
            confirmLabel="Finalize"
            onConfirm={handleFinalize}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </div>
    </Shell>
  );
}
