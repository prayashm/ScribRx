import { describe, expect, it } from 'vitest';
import { mergeDraft, canFinalizeDraft } from '../pages/NewRx';
import { PrescriptionDraftDefault, type PrescriptionDraft } from '../schemas/prescription';

describe('NewRx draft merging and finalize checks', () => {
  it('preserves existing medicines on diagnosis-only updates', () => {
    const current: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
      lab_tests: ['CBC'],
      follow_up_questions: ['Any allergy history?'],
    };

    const update: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: {},
      diagnosis: 'Viral Fever',
    };

    const merged = mergeDraft(current, update);

    expect(merged.diagnosis).toBe('Viral Fever');
    expect(merged.medicines).toEqual(current.medicines);
    expect(merged.patient).toEqual(current.patient);
    expect(merged.lab_tests).toEqual(current.lab_tests);
  });

  it('preserves patient when update only contains medicines', () => {
    const current: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: { name: 'Ayush', age: 30, gender: 'M' },
    };

    const update: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: {},
      medicines: [{ name: 'Azee 500', genericName: 'Azithromycin' }],
    };

    const merged = mergeDraft(current, update);

    expect(merged.patient).toEqual(current.patient);
    expect(merged.medicines).toEqual(update.medicines);
  });

  it('handles undefined arrays without wiping existing data', () => {
    const current: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      diagnosis: 'URTI',
      medicines: [{ name: 'Dolo 650' }],
      lab_tests: ['CBC'],
      notes: 'Hydrate well',
      follow_up_questions: ['Any fever duration?'],
    };

    const merged = mergeDraft(current, {
      patient: { name: 'Ravi' },
      medicines: undefined as unknown as PrescriptionDraft['medicines'],
      lab_tests: undefined as unknown as PrescriptionDraft['lab_tests'],
      follow_up_questions: undefined as unknown as PrescriptionDraft['follow_up_questions'],
    } as PrescriptionDraft);

    expect(merged.medicines).toEqual(current.medicines);
    expect(merged.lab_tests).toEqual(current.lab_tests);
    expect(merged.follow_up_questions).toEqual(current.follow_up_questions);
  });

  it('finalize checks all critical invalid states', () => {
    const base: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
    };

    expect(canFinalizeDraft(base)).toBe(true);
    expect(canFinalizeDraft({ ...base, patient: { age: 32, gender: 'M' } })).toBe(false);
    expect(canFinalizeDraft({ ...base, patient: { name: 'Ravi', gender: 'M' } })).toBe(false);
    expect(canFinalizeDraft({ ...base, medicines: [] })).toBe(false);
    expect(canFinalizeDraft({ ...base, medicines: [{ name: '   ' }] })).toBe(false);
    expect(canFinalizeDraft({ ...base, patient: { name: 'string', age: 32, gender: 'M' } })).toBe(false);
  });

  it('accepts age when provided as numeric string and does not require gender', () => {
    const draft = {
      patient: { name: 'Ravi', age: '32' },
      medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
      lab_tests: [],
      follow_up_questions: [],
    } as unknown as PrescriptionDraft;

    expect(canFinalizeDraft(draft)).toBe(true);
  });

  it('rejects zero age even when provided as string', () => {
    const draft = {
      patient: { name: 'Ravi', age: '0' },
      medicines: [{ name: 'Dolo 650' }],
      lab_tests: [],
      follow_up_questions: [],
    } as unknown as PrescriptionDraft;

    expect(canFinalizeDraft(draft)).toBe(false);
  });

  it('rejects placeholder patient and medicine names', () => {
    const draft: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: { name: 'unknown', age: 32, gender: 'M' },
      medicines: [{ name: 'string', dosage: '650mg' }],
    };

    expect(canFinalizeDraft(draft)).toBe(false);
  });

  it('merge replaces medicines when update adds/removes entries', () => {
    const current: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      medicines: [
        { name: 'Dolo 650', dosage: '650mg' },
        { name: 'Azee 500', dosage: '500mg' },
      ],
    };

    const update: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: {},
      medicines: [{ name: 'Azee 500', dosage: '500mg' }, { name: 'Pan 40', dosage: '40mg' }],
    };

    const merged = mergeDraft(current, update);
    expect(merged.medicines).toEqual(update.medicines);
  });

  it('merge keeps existing age when update age is non-numeric text', () => {
    const current: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: { name: 'Ravi', age: 28, gender: 'M' },
      medicines: [{ name: 'Dolo 650' }],
    };

    const update = {
      patient: { age: 'thirty' },
      medicines: [{ name: 'Dolo 650' }],
      lab_tests: [],
      follow_up_questions: [],
    } as unknown as PrescriptionDraft;

    const merged = mergeDraft(current, update);
    expect(merged.patient.age).toBe(28);
  });
});
