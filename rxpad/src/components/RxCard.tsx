import type { PrescriptionDraft } from '../schemas/prescription';

interface Props {
  draft: PrescriptionDraft;
  canFinalize?: boolean;
  onFinalize?: () => void;
  finalizing?: boolean;
}

export function RxCard({ draft, canFinalize, onFinalize, finalizing }: Props) {
  const hasPatient = draft.patient?.name || draft.patient?.age;
  const hasMeds = draft.medicines && draft.medicines.length > 0 && draft.medicines.some(m => m.name);
  const hasTests = draft.lab_tests && draft.lab_tests.length > 0;
  const hasNotes = !!draft.notes;

  if (!hasPatient && !hasMeds && !hasTests && !hasNotes) return null;

  return (
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Patient */}
      {hasPatient && (
        <div class="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
          <span class="text-sm">👤</span>
          <span class="text-sm font-medium text-gray-800">
            {draft.patient.name || 'Unknown'}{draft.patient.age ? `, ${draft.patient.age}${draft.patient.gender ? draft.patient.gender : ''}` : ''}
          </span>
        </div>
      )}

      {/* Medicines */}
      {hasMeds && (
        <div class="px-3 py-2 space-y-1">
          {draft.medicines.filter(m => m.name).map((med, i) => (
            <div key={i} class="flex items-start gap-2">
              <span class="text-sm shrink-0">💊</span>
              <div class="text-sm text-gray-700">
                <span class="font-medium">{med.name}</span>
                {med.dosage && <span class="text-gray-500"> {med.dosage}</span>}
                {(med.frequency || med.duration) && (
                  <span class="text-gray-400">
                    {' · '}{[med.frequency, med.duration].filter(Boolean).join(' · ')}
                  </span>
                )}
                {med.instructions && (
                  <span class="text-gray-400 italic"> — {med.instructions}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lab tests */}
      {hasTests && (
        <div class="px-3 py-2 border-t border-gray-100">
          <div class="flex items-start gap-2">
            <span class="text-sm">🔬</span>
            <span class="text-sm text-gray-700">{draft.lab_tests.join(', ')}</span>
          </div>
        </div>
      )}

      {/* Notes */}
      {hasNotes && (
        <div class="px-3 py-2 border-t border-gray-100">
          <div class="flex items-start gap-2">
            <span class="text-sm">📝</span>
            <span class="text-sm text-gray-600 italic">{draft.notes}</span>
          </div>
        </div>
      )}

      {/* Finalize */}
      {canFinalize && onFinalize && (
        <div class="px-3 py-2 border-t border-gray-100">
          <button
            onClick={onFinalize}
            disabled={finalizing}
            style="background: #1e3a5f" class="w-full text-white py-2.5 rounded-lg font-medium text-sm disabled:bg-gray-300"
          >
            {finalizing ? 'Generating...' : '✅ Finalize & Share'}
          </button>
        </div>
      )}
    </div>
  );
}
