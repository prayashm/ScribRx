import { useState } from 'preact/hooks';
import type { Prescription } from '../schemas/prescription';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  rx: Prescription;
  onCancel: (rx: Prescription) => void;
  onShare: (rx: Prescription) => void;
  onContinueEdit?: (rx: Prescription) => void;
  onBack: () => void;
}

export function PrescriptionView({ rx, onCancel, onShare, onContinueEdit, onBack }: Props) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const date = new Date(rx.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div class="p-4 max-w-lg mx-auto">
      <button onClick={onBack} class="text-blue-600 text-sm mb-4 flex items-center gap-1">
        <span>&larr;</span> Back
      </button>

      <div class={`bg-white rounded-xl border p-5 ${rx.status === 'cancelled' ? 'opacity-60' : ''}`}>
        {rx.status === 'cancelled' && (
          <div class="text-center text-red-600 font-bold text-xl mb-3 tracking-widest">CANCELLED</div>
        )}

        <div class="flex justify-between items-start mb-4">
          <div>
            <h2 class="text-lg font-semibold">{rx.patient.name}</h2>
            <p class="text-sm text-gray-500">
              {rx.patient.age}y / {rx.patient.gender}
            </p>
          </div>
          <div class="text-right text-sm text-gray-500">
            <div>{rx.id}</div>
            <div>{date}</div>
          </div>
        </div>

        <div class="border-t pt-3">
          <h3 class="font-semibold text-sm text-gray-700 mb-2">{'\u211E'} Medicines</h3>
          {rx.medicines.map((med, i) => (
            <div key={i} class="mb-2 pl-4">
              <div class="text-sm font-medium">
                {i + 1}. {med.name} — {med.dosage}
              </div>
              <div class="text-xs text-gray-500">
                {med.frequency} &middot; {med.duration}
                {med.instructions && ` &middot; ${med.instructions}`}
              </div>
            </div>
          ))}
        </div>

        {rx.labTests.length > 0 && (
          <div class="border-t pt-3 mt-3">
            <h3 class="font-semibold text-sm text-gray-700 mb-1">Lab Tests</h3>
            <ul class="list-disc list-inside text-sm text-gray-600">
              {rx.labTests.map((test, i) => (
                <li key={i}>{test}</li>
              ))}
            </ul>
          </div>
        )}

        {rx.notes && (
          <div class="border-t pt-3 mt-3">
            <h3 class="font-semibold text-sm text-gray-700 mb-1">Advice</h3>
            <p class="text-sm text-gray-600 italic">{rx.notes}</p>
          </div>
        )}
      </div>

      <div class="flex gap-3 mt-4">
        {rx.status === 'draft' && onContinueEdit && (
          <button
            onClick={() => onContinueEdit(rx)}
            class="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm"
          >
            Continue Editing
          </button>
        )}
        {(rx.status === 'finalized' || rx.status === 'cancelled') && (
          <button
            onClick={() => onShare(rx)}
            class="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm"
          >
            Share PDF
          </button>
        )}
        {rx.status === 'finalized' && (
          <button
            onClick={() => setShowCancelConfirm(true)}
            class="flex-1 bg-red-50 text-red-600 py-2.5 rounded-lg font-medium text-sm border border-red-200"
          >
            Cancel Prescription
          </button>
        )}
      </div>

      {showCancelConfirm && (
        <ConfirmDialog
          title="Cancel Prescription"
          message="This will mark the prescription as cancelled and regenerate the PDF with a CANCELLED watermark. This cannot be undone."
          confirmLabel="Cancel Prescription"
          destructive
          onConfirm={() => {
            setShowCancelConfirm(false);
            onCancel(rx);
          }}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}
