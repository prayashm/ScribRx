import { useState, useEffect } from 'preact/hooks';
import { Shell } from '../components/Shell';
import { PrescriptionCard } from '../components/PrescriptionCard';
import { PrescriptionView } from '../components/PrescriptionView';
import { listPrescriptions, savePrescription, getProfile } from '../lib/db';
import { generatePrescriptionPDF } from '../lib/pdf';
import { signPrescription, generateQRCode } from '../lib/qr';
import type { Prescription } from '../schemas/prescription';
import type { DoctorProfile } from '../schemas/profile';

export function History({ path: _path }: { path?: string }) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [profile, setProfile] = useState<DoctorProfile | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setPrescriptions(await listPrescriptions());
    setProfile(await getProfile());
  }

  async function handleCancel(rx: Prescription) {
    if (!profile) return;
    const updated: Prescription = {
      ...rx,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    };

    // Re-sign and regenerate PDF with CANCELLED watermark
    const qrPayload = await signPrescription(updated, profile);
    updated.qrPayload = qrPayload;
    const qrDataUrl = await generateQRCode(qrPayload);
    const blob = await generatePrescriptionPDF(updated, profile, qrDataUrl);
    updated.pdfBlob = blob;

    await savePrescription(updated);
    setSelected(updated);
    await loadData();
  }

  async function handleShare(rx: Prescription) {
    if (!rx.pdfBlob) return;
    const file = new File([rx.pdfBlob], `${rx.id}.pdf`, { type: 'application/pdf' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: rx.id });
      } catch {
        // user cancelled
      }
    } else {
      const url = URL.createObjectURL(rx.pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rx.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  const filtered = prescriptions.filter((rx) =>
    rx.patient.name.toLowerCase().includes(search.toLowerCase())
  );

  if (selected) {
    return (
      <Shell activeTab="/history">
        <PrescriptionView
          rx={selected}
          onCancel={handleCancel}
          onShare={handleShare}
          onBack={() => {
            setSelected(null);
            loadData();
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell activeTab="/history">
      <div class="p-4 max-w-lg mx-auto">
        <h1 class="text-xl font-bold text-gray-900 mb-4">Prescription History</h1>

        <input
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="Search by patient name..."
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />

        {filtered.length === 0 ? (
          <div class="text-center py-12 text-gray-400">
            <div class="text-4xl mb-3">{'\u211E'}</div>
            <p class="text-sm">
              {prescriptions.length === 0 ? 'No prescriptions yet' : 'No matching prescriptions'}
            </p>
          </div>
        ) : (
          <div class="space-y-3">
            {filtered.map((rx) => (
              <PrescriptionCard key={rx.id} rx={rx} onClick={() => setSelected(rx)} />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
