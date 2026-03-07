import { useState, useEffect, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import { ChatInput } from '../components/ChatInput';
import { RxCard } from '../components/RxCard';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  getNextRxId,
  savePrescription,
  getProfile,
  getConfig,
  saveConfig,
} from '../lib/db';
import { generatePrescriptionPDF } from '../lib/pdf';
import { signPrescription, generateQRCode } from '../lib/qr';
import { parsePrescriptionUpdate, type AIProvider } from '../lib/gemini';
import type { Prescription, PrescriptionDraft } from '../schemas/prescription';
import type { DoctorProfile } from '../schemas/profile';

interface ChatMessage {
  id: number;
  role: 'user' | 'ai';
  text?: string;
  draft?: PrescriptionDraft;
  questions?: string[];
  isTyping?: boolean;
}

interface Props {
  path?: string;
  editDraft?: Prescription;
}

let msgId = 0;

export function NewRx({ editDraft: _editDraft }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<PrescriptionDraft>({
    patient: {},
    medicines: [],
    lab_tests: [],
    follow_up_questions: [],
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showConfirm, setShowConfirm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState<{ rx: Prescription; blob: Blob } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      setProfile(p);
      const selectedProvider = (await getConfig<AIProvider>('aiProvider')) || 'gemini';
      setProvider(selectedProvider);
      const key = selectedProvider === 'openrouter'
        ? await getConfig<string>('openrouterApiKey')
        : await getConfig<string>('geminiApiKey');
      if (key) setApiKey(key);

      // Restore draft or show greeting
      const saved = await getConfig<{ draft: PrescriptionDraft; messages: ChatMessage[] }>('activeDraft');
      if (saved && saved.messages && saved.messages.length > 1) {
        setDraft(saved.draft);
        // Re-assign msgIds to avoid collisions
        const restored = saved.messages.map(m => ({ ...m, id: ++msgId }));
        setMessages(restored);
      } else {
        setMessages([{
          id: ++msgId,
          role: 'ai',
          text: p ? `Hi Dr. ${p.fullName.split(' ')[0]}! 👋 Dictate or type the prescription details.` : 'Hi! Dictate or type the prescription details.',
        }]);
      }
    })();
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist draft + messages on change
  useEffect(() => {
    if (messages.length > 1) {
      saveConfig('activeDraft', { draft, messages: messages.filter(m => !m.isTyping) });
    }
  }, [draft, messages]);

  const canFinalize =
    !!(draft.patient?.name?.trim()) &&
    !!(draft.patient?.age && draft.patient.age > 0) &&
    draft.medicines.some(m => m.name?.trim());

  async function handleSend(text: string) {
    // Add user message
    setMessages(prev => [...prev, { id: ++msgId, role: 'user', text }]);

    if (!apiKey) {
      setMessages(prev => [...prev, { id: ++msgId, role: 'ai', text: '⚠️ API key not configured. Go to Settings first.' }]);
      return;
    }
    if (!isOnline) {
      setMessages(prev => [...prev, { id: ++msgId, role: 'ai', text: '⚠️ You\'re offline. Please check your connection.' }]);
      return;
    }

    // Show typing indicator
    const typingId = ++msgId;
    setMessages(prev => [...prev, { id: typingId, role: 'ai', isTyping: true }]);
    setAiLoading(true);

    try {
      const currentDraft = (draft.patient?.name || draft.medicines.length > 0) ? draft : null;
      const result = await parsePrescriptionUpdate(provider, apiKey, currentDraft, { type: 'text', text });

      // Merge result into draft
      const newDraft: PrescriptionDraft = {
        patient: {
          name: result.patient?.name || draft.patient?.name,
          age: result.patient?.age ?? draft.patient?.age,
          gender: result.patient?.gender || draft.patient?.gender,
        },
        medicines: (result.medicines && result.medicines.length > 0) ? result.medicines : draft.medicines,
        lab_tests: (result.lab_tests && result.lab_tests.length > 0) ? result.lab_tests : draft.lab_tests,
        notes: result.notes || draft.notes,
        follow_up_questions: result.follow_up_questions || [],
      };
      setDraft(newDraft);

      // Replace typing with AI response
      setMessages(prev => prev.filter(m => m.id !== typingId).concat({
        id: ++msgId,
        role: 'ai',
        draft: newDraft,
        questions: newDraft.follow_up_questions?.length ? newDraft.follow_up_questions : undefined,
      }));
    } catch (err: any) {
      console.error('Parse error:', err);
      setMessages(prev => prev.filter(m => m.id !== typingId).concat({
        id: ++msgId,
        role: 'ai',
        text: err?.message?.includes('401') || err?.message?.includes('403')
          ? `⚠️ ${provider === 'openrouter' ? 'OpenRouter' : 'Gemini'} key invalid. Check Settings.`
          : `⚠️ ${err?.message || 'Something went wrong. Try again.'}`,
      }));
    } finally {
      setAiLoading(false);
    }
  }

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
          name: draft.patient.name?.trim() || '',
          age: draft.patient.age || 0,
          gender: draft.patient.gender || 'M',
        },
        medicines: draft.medicines.filter(m => m.name?.trim()),
        labTests: draft.lab_tests || [],
        notes: draft.notes?.trim() || undefined,
      };

      const qrPayload = await signPrescription(rx, profile);
      rx.qrPayload = qrPayload;
      const qrDataUrl = await generateQRCode(qrPayload);
      const blob = await generatePrescriptionPDF(rx, profile, qrDataUrl);
      rx.pdfBlob = blob;

      await savePrescription(rx);
      await saveConfig('activeDraft', null);
      setFinalized({ rx, blob });

      setMessages(prev => [...prev, {
        id: ++msgId,
        role: 'ai',
        text: `✅ Prescription ${rxId} is ready!`,
      }]);
    } catch (err) {
      console.error('Finalize error:', err);
      setMessages(prev => [...prev, {
        id: ++msgId,
        role: 'ai',
        text: '⚠️ Failed to finalize. Please try again.',
      }]);
    } finally {
      setFinalizing(false);
    }
  }

  async function handleShare() {
    if (!finalized) return;
    const { rx, blob } = finalized;
    const file = new File([blob], `${rx.id}.pdf`, { type: 'application/pdf' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: rx.id }); } catch {}
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${rx.id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    }
  }

  function resetAll() {
    saveConfig('activeDraft', null);
    setMessages([{
      id: ++msgId,
      role: 'ai',
      text: profile ? `Hi Dr. ${profile.fullName.split(' ')[0]}! 👋 Ready for a new prescription.` : 'Ready for a new prescription.',
    }]);
    setDraft({ patient: {}, medicines: [], lab_tests: [], follow_up_questions: [] });
    setFinalized(null);
  }

  // ── Post-finalize view ──
  if (finalized) {
    const { rx } = finalized;
    const dateStr = rx.finalizedAt
      ? new Date(rx.finalizedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
    return (
      <div class="flex flex-col h-screen max-w-lg mx-auto bg-gray-50">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-2.5 text-white" style="background: #1e3a5f;">
          <h1 class="text-base font-semibold">✅ Prescription Sent</h1>
          <button onClick={() => route('/history')} class="p-2 rounded-full hover:bg-white/10" title="History">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Prescription summary card */}
          <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div class="bg-sky-50 px-4 py-3 border-b border-sky-100 flex items-center justify-between">
              <div>
                <p class="font-semibold text-gray-900">{rx.patient.name || 'Patient'}</p>
                <p class="text-xs text-gray-500">{rx.patient.age ? `${rx.patient.age}y` : ''}{rx.patient.gender ? ` / ${rx.patient.gender}` : ''} · {dateStr}</p>
              </div>
              <span class="text-xs bg-sky-100 text-sky-700 px-2 py-1 rounded-full font-medium">Finalized</span>
            </div>

            <div class="px-4 py-3 space-y-2">
              {rx.medicines.map((med, i) => (
                <div key={i} class="flex items-start gap-2">
                  <span class="text-sm font-bold shrink-0">{i + 1}.</span>
                  <div class="text-sm">
                    <span class="font-medium text-gray-900">{med.name}</span>
                    {med.dosage && <span class="text-gray-600"> {med.dosage}</span>}
                    <div class="text-xs text-gray-500">
                      {[med.frequency, med.duration, med.instructions].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {rx.labTests.length > 0 && (
              <div class="px-4 py-2 border-t">
                <p class="text-xs text-gray-500 mb-1">Lab Tests</p>
                <p class="text-sm text-gray-700">{rx.labTests.join(', ')}</p>
              </div>
            )}

            {rx.notes && (
              <div class="px-4 py-2 border-t">
                <p class="text-xs text-gray-500 mb-1">Advice</p>
                <p class="text-sm text-gray-700 italic">{rx.notes}</p>
              </div>
            )}

            <div class="px-4 py-2 border-t bg-gray-50">
              <p class="text-xs text-gray-400 font-mono">{rx.id}</p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div class="p-4 bg-white border-t space-y-2">
          <button onClick={handleShare} style="background: #1e3a5f" class="w-full text-white py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 text-base">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.243-1.215l-.302-.18-2.836.842.842-2.836-.18-.302A8 8 0 1 1 12 20z" />
            </svg>
            Send via WhatsApp
          </button>
          <div class="flex gap-2">
            <button onClick={() => { if (!finalized) return; const u = URL.createObjectURL(finalized.blob); const a = document.createElement('a'); a.href = u; a.download = `${finalized.rx.id}.pdf`; a.click(); URL.revokeObjectURL(u); }} class="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm">
              📥 Download PDF
            </button>
            <button onClick={resetAll} class="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm">
              ➕ New Rx
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div class="flex flex-col h-screen max-w-lg mx-auto">
        {/* Header with nav */}
        <div class="flex items-center justify-between px-4 py-2.5 text-white" style="background: #1e3a5f;">
          <h1 class="text-base font-semibold">Rx</h1>
          <div class="flex items-center gap-1">
            {messages.length > 1 && (
              <button onClick={resetAll} class="text-xs px-2.5 py-1 rounded-full bg-green-600" title="New">
                + New
              </button>
            )}
            <button onClick={() => route('/history')} class="p-2 rounded-full hover:bg-white/10" title="History">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            </button>
            <button onClick={() => route('/settings')} class="p-2 rounded-full hover:bg-white/10" title="Settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div class="flex-1 overflow-y-auto px-3 py-4 space-y-3" style="background: #f0f4f8;">
          {messages.map(msg => {
            if (msg.isTyping) {
              return (
                <div key={msg.id} class="flex justify-start">
                  <div class="bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm max-w-[85%]">
                    <div class="flex gap-1">
                      <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms" />
                      <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms" />
                      <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms" />
                    </div>
                  </div>
                </div>
              );
            }

            if (msg.role === 'user') {
              return (
                <div key={msg.id} class="flex justify-end">
                  <div class="rounded-lg rounded-tr-none px-3 py-2 shadow-sm max-w-[85%]" style="background: #e0f2fe; border: 1px solid #7dd3fc;">
                    <p class="text-sm" style="color: #0c4a6e">{msg.text}</p>
                  </div>
                </div>
              );
            }

            // AI message
            return (
              <div key={msg.id} class="flex justify-start">
                <div class="bg-white rounded-lg rounded-tl-none px-3 py-2 shadow-sm max-w-[85%] space-y-2">
                  {msg.text && <p class="text-sm" style="color: #0c4a6e">{msg.text}</p>}
                  {msg.draft && (
                    <RxCard
                      draft={msg.draft}
                      canFinalize={canFinalize && msg.id === messages[messages.length - 1]?.id}
                      onFinalize={() => setShowConfirm(true)}
                      finalizing={finalizing}
                    />
                  )}
                  {msg.questions && msg.questions.length > 0 && (
                    <div class="space-y-1 pt-1">
                      {msg.questions.map((q, i) => (
                        <p key={i} class="text-sm text-amber-700">❓ {q}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar - above Shell's nav */}
        <ChatInput onSend={handleSend} disabled={aiLoading} />
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
    </>
  );
}
