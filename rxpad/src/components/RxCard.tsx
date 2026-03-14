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
  const diagnosis = cleanText(draft.diagnosis);
  const complaints = (draft.complaints || []).map((c) => c?.trim?.() || '').filter((c) => isMeaningful(c));
  const symptoms = (draft.symptoms || []).map((s) => s?.trim?.() || '').filter((s) => isMeaningful(s));
  const signs = (draft.signs || []).map((s) => s?.trim?.() || '').filter((s) => isMeaningful(s));
  const examination = cleanText(draft.examination);
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
  const hasDiagnosis = !!diagnosis;
  const hasComplaints = complaints.length > 0;
  const hasSymptoms = symptoms.length > 0;
  const hasSigns = signs.length > 0;
  const hasExamination = !!examination;
  const hasMeds = medicines.length > 0;
  const hasTests = labTests.length > 0;
  const hasNotes = !!notes;

  if (!hasPatient && !hasDiagnosis && !hasMeds && !hasTests && !hasNotes && !hasComplaints && !hasSymptoms && !hasSigns && !hasExamination) return null;

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

      {/* Complaints, Symptoms, Signs */}
      {(hasComplaints || hasSymptoms || hasSigns) && (
        <div class="px-3 py-2 border-b border-gray-100 space-y-1">
          {hasComplaints && (
            <div class="flex items-start gap-2">
              <span class="text-sm shrink-0">🚩</span>
              <span class="text-sm text-gray-700"><span class="font-medium">Complaints:</span> {complaints.join(', ')}</span>
            </div>
          )}
          {hasSymptoms && (
            <div class="flex items-start gap-2">
              <span class="text-sm shrink-0">🤒</span>
              <span class="text-sm text-gray-700"><span class="font-medium">Symptoms:</span> {symptoms.join(', ')}</span>
            </div>
          )}
          {hasSigns && (
            <div class="flex items-start gap-2">
              <span class="text-sm shrink-0">🔍</span>
              <span class="text-sm text-gray-700"><span class="font-medium">Signs:</span> {signs.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Examination */}
      {hasExamination && (
        <div class="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
          <span class="text-sm">📏</span>
          <span class="text-sm text-gray-700"><span class="font-medium">Exam:</span> {examination}</span>
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
