import { describe, it, expect } from 'vitest';
import { mergeDraft, canFinalizeDraft } from '../pages/NewRx';
import type { PrescriptionDraft } from '../schemas/prescription';

describe('NewRx draft logic', () => {
  it('preserves existing medicines when AI returns diagnosis-only update', () => {
    const current: PrescriptionDraft = {
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
      lab_tests: [],
      follow_up_questions: [],
    };

    const update: PrescriptionDraft = {
      patient: {},
      diagnosis: 'Viral Fever',
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };

    const merged = mergeDraft(current, update);
    expect(merged.diagnosis).toBe('Viral Fever');
    expect(merged.medicines.length).toBe(1);
    expect(merged.medicines[0].name).toBe('Dolo 650');
  });

  it('enables finalize only when required fields are present', () => {
    const invalid: PrescriptionDraft = {
      patient: { name: 'Ravi' },
      medicines: [{ name: 'Dolo 650' }],
      lab_tests: [],
      follow_up_questions: [],
    };

    const valid: PrescriptionDraft = {
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      medicines: [{ name: 'Dolo 650', genericName: 'Paracetamol' }],
      lab_tests: [],
      follow_up_questions: [],
    };

    expect(canFinalizeDraft(invalid)).toBe(false);
    expect(canFinalizeDraft(valid)).toBe(true);
  });
});
