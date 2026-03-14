import type { PrescriptionDraft } from '../schemas/prescription';

interface Props {
  draft: PrescriptionDraft;
  canFinalize?: boolean;
  onFinalize?: () => void;
  finalizing?: boolean;
}

const PLACEHOLDER_VALUES = new Set(['string', 'unknown', 'undefined', 'null', 'n/a', 'na', 'none']);

function isMeaningful(value?: string): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !PLACEHOLDER_VALUES.has(trimmed.toLowerCase());
}

function cleanText(value?: string): string | undefined {
  return isMeaningful(value) ? value.trim() : undefined;
}

export function RxCard({ draft, canFinalize, onFinalize, finalizing }: Props) {
  const patientName = cleanText(draft.patient?.name);
  const complaints = cleanText(draft.complaints);
  const symptoms = cleanText(draft.symptoms);
  const examination = cleanText(draft.examination);
  const diagnosis = cleanText(draft.diagnosis);
  const notes = cleanText(draft.notes);
  const labTests = (draft.lab_tests || []).map((test) => test?.trim?.() || '').filter((test) => isMeaningful(test));
  const medicines = (draft.medicines || [])
    .map((med) => ({
      ...med,
      name: cleanText(med.name) || '',
      genericName: cleanText(med.genericName),
      dosage: cleanText(med.dosage),
      frequency: cleanText(med.frequency),
      duration: cleanText(med.duration),
      instructions: cleanText(med.instructions),
    }))
    .filter((med) => isMeaningful(med.name));

  const patientAge = draft.patient?.age;
  const patientGender = draft.patient?.gender;
  const hasPatient = !!patientName || !!patientAge;
  const hasComplaints = !!complaints;
  const hasSymptoms = !!symptoms;
  const hasExamination = !!examination;
  const hasDiagnosis = !!diagnosis;
  const hasMeds = medicines.length > 0;
  const hasTests = labTests.length > 0;
  const hasNotes = !!notes;

  if (!hasPatient && !hasComplaints && !hasSymptoms && !hasExamination && !hasDiagnosis && !hasMeds && !hasTests && !hasNotes) return null;

  return (
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Patient */}
      {hasPatient && (
        <div class="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
          <span class="text-sm">👤</span>
          <span class="text-sm font-medium text-gray-800">
            {patientName || 'Unknown'}{patientAge ? `, ${patientAge}${patientGender ? patientGender : ''}` : ''}
          </span>
        </div>
      )}

      {/* Complaints */}
      {hasComplaints && (
        <div class="px-3 py-2 border-b border-gray-100 flex items-start gap-2">
          <span class="text-sm shrink-0">💬</span>
          <span class="text-sm text-gray-700"><span class="font-medium">C/O:</span> {complaints}</span>
        </div>
      )}

      {/* Symptoms & Signs */}
      {hasSymptoms && (
        <div class="px-3 py-2 border-b border-gray-100 flex items-start gap-2">
          <span class="text-sm shrink-0">🌡️</span>
          <span class="text-sm text-gray-700"><span class="font-medium">S/S:</span> {symptoms}</span>
        </div>
      )}

      {/* Examination */}
      {hasExamination && (
        <div class="px-3 py-2 border-b border-gray-100 flex items-start gap-2">
          <span class="text-sm shrink-0">🔍</span>
          <span class="text-sm text-gray-700"><span class="font-medium">O/E:</span> {examination}</span>
        </div>
      )}

      {/* Diagnosis */}
      {hasDiagnosis && (
        <div class="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
          <span class="text-sm">🩺</span>
          <span class="text-sm text-gray-700"><span class="font-medium">Dx:</span> {diagnosis}</span>
        </div>
      )}

      {/* Medicines */}
      {hasMeds && (
        <div class="px-3 py-2 space-y-1">
          {medicines.map((med, i) => (
            <div key={i} class="flex items-start gap-2">
              <span class="text-sm shrink-0">💊</span>
              <div class="text-sm text-gray-700">
                <span class="font-medium">{med.name}</span>
                {med.genericName && <span class="text-blue-600 text-xs ml-1">({med.genericName})</span>}
                {med.dosage && <span class="text-gray-500"> {med.dosage}</span>}
                {(med.frequency || med.duration) && (
                  <span class="text-gray-400">
                    {' · '}{[med.frequency, med.duration].filter(Boolean).join(' · ')}
                  </span>
                )}
                {med.instructions && (
                  <span class="text-gray-400 italic"> - {med.instructions}</span>
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
            <span class="text-sm text-gray-700">{labTests.join(', ')}</span>
          </div>
        </div>
      )}

      {/* Notes */}
      {hasNotes && (
        <div class="px-3 py-2 border-t border-gray-100">
          <div class="flex items-start gap-2">
            <span class="text-sm">📝</span>
            <span class="text-sm text-gray-600 italic">{notes}</span>
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
