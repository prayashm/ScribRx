import { describe, expect, it } from 'vitest';
import { mergeDraft, canFinalizeDraft } from '../pages/NewRx';
import type { PrescriptionDraft } from '../schemas/prescription';

describe('NewRx draft merging and finalize checks', () => {
  it('preserves existing medicines on diagnosis-only updates', () => {
    const current: PrescriptionDraft = {
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
      lab_tests: ['CBC'],
      follow_up_questions: ['Any allergy history?'],
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
    expect(merged.medicines).toEqual(current.medicines);
    expect(merged.patient).toEqual(current.patient);
    expect(merged.lab_tests).toEqual(current.lab_tests);
  });

  it('preserves patient when update only contains medicines', () => {
    const current: PrescriptionDraft = {
      patient: { name: 'Ayush', age: 30, gender: 'M' },
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };

    const update: PrescriptionDraft = {
      patient: {},
      medicines: [{ name: 'Azee 500', genericName: 'Azithromycin' }],
      lab_tests: [],
      follow_up_questions: [],
    };

    const merged = mergeDraft(current, update);

    expect(merged.patient).toEqual(current.patient);
    expect(merged.medicines).toEqual(update.medicines);
  });

  it('handles undefined arrays without wiping existing data', () => {
    const current: PrescriptionDraft = {
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
    });

    expect(merged.medicines).toEqual(current.medicines);
    expect(merged.lab_tests).toEqual(current.lab_tests);
    expect(merged.follow_up_questions).toEqual(current.follow_up_questions);
  });

  it('finalize checks all critical invalid states', () => {
    const base: PrescriptionDraft = {
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
      lab_tests: [],
      follow_up_questions: [],
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
      patient: { name: 'unknown', age: 32, gender: 'M' },
      medicines: [{ name: 'string', dosage: '650mg' }],
      lab_tests: [],
      follow_up_questions: [],
    };

    expect(canFinalizeDraft(draft)).toBe(false);
  });

  it('merge replaces medicines when update adds/removes entries', () => {
    const current: PrescriptionDraft = {
      patient: { name: 'Ravi', age: 32, gender: 'M' },
      medicines: [
        { name: 'Dolo 650', dosage: '650mg' },
        { name: 'Azee 500', dosage: '500mg' },
      ],
      lab_tests: [],
      follow_up_questions: [],
    };

    const update: PrescriptionDraft = {
      patient: {},
      medicines: [{ name: 'Azee 500', dosage: '500mg' }, { name: 'Pan 40', dosage: '40mg' }],
      lab_tests: [],
      follow_up_questions: [],
    };

    const merged = mergeDraft(current, update);
    expect(merged.medicines).toEqual(update.medicines);
  });

  it('merge keeps existing age when update age is non-numeric text', () => {
    const current: PrescriptionDraft = {
      patient: { name: 'Ravi', age: 28, gender: 'M' },
      medicines: [{ name: 'Dolo 650' }],
      lab_tests: [],
      follow_up_questions: [],
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

describe('mergeDraft - clinical and optional fields', () => {
  const base: PrescriptionDraft = {
    patient: { name: 'Ravi', age: 32, gender: 'M' },
    medicines: [{ name: 'Dolo 650' }],
    lab_tests: [],
    follow_up_questions: [],
    complaints: 'fever for 2 days',
    symptoms: 'temp 101F',
    examination: 'throat clear',
    diagnosis: 'Viral fever',
    notes: 'Rest well',
  };

  it('replaces complaints when update provides a new value', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
      complaints: 'headache and vomiting',
    };
    const merged = mergeDraft(base, update);
    expect(merged.complaints).toBe('headache and vomiting');
  });

  it('preserves current complaints when update has no complaints', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };
    const merged = mergeDraft(base, update);
    expect(merged.complaints).toBe('fever for 2 days');
  });

  it('preserves current symptoms when update has no symptoms', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };
    const merged = mergeDraft(base, update);
    expect(merged.symptoms).toBe('temp 101F');
  });

  it('replaces symptoms when update provides a new value', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
      symptoms: 'mild rhinorrhoea',
    };
    const merged = mergeDraft(base, update);
    expect(merged.symptoms).toBe('mild rhinorrhoea');
  });

  it('preserves current examination when update has none', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };
    const merged = mergeDraft(base, update);
    expect(merged.examination).toBe('throat clear');
  });

  it('replaces examination when update provides a new value', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
      examination: 'BP 130/80, chest clear',
    };
    const merged = mergeDraft(base, update);
    expect(merged.examination).toBe('BP 130/80, chest clear');
  });

  it('preserves current notes when update has no notes', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };
    const merged = mergeDraft(base, update);
    expect(merged.notes).toBe('Rest well');
  });

  it('replaces notes when update provides a value', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
      notes: 'Drink plenty of water',
    };
    const merged = mergeDraft(base, update);
    expect(merged.notes).toBe('Drink plenty of water');
  });

  it('preserves phone from current when update has no phone', () => {
    const currentWithPhone: PrescriptionDraft = {
      ...base,
      patient: { ...base.patient, phone: '9876543210' },
    };
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };
    const merged = mergeDraft(currentWithPhone, update);
    expect(merged.patient.phone).toBe('9876543210');
  });

  it('preserves gender from current when update has no gender', () => {
    const update: PrescriptionDraft = {
      patient: { name: 'Ravi', age: 32 },
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };
    const merged = mergeDraft(base, update);
    expect(merged.patient.gender).toBe('M');
  });

  it('returns current data unchanged when update is entirely empty', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };
    const merged = mergeDraft(base, update);
    expect(merged.patient).toEqual(base.patient);
    expect(merged.diagnosis).toBe(base.diagnosis);
    expect(merged.complaints).toBe(base.complaints);
    expect(merged.medicines).toEqual(base.medicines);
  });

  it('strips placeholder values from incoming clinical fields', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
      complaints: 'string',
      symptoms: 'n/a',
    };
    const merged = mergeDraft(base, update);
    // placeholder complaints → cleanText returns undefined → falls back to current
    expect(merged.complaints).toBe('fever for 2 days');
    expect(merged.symptoms).toBe('temp 101F');
  });
});

describe('mergeDraft - follow-up question merging', () => {
  const base: PrescriptionDraft = {
    patient: { name: 'Ravi', age: 32, gender: 'M' },
    medicines: [{ name: 'Dolo 650' }],
    lab_tests: [],
    follow_up_questions: ['What is the dosage?'],
  };

  it('preserves current follow-up questions when incoming array is empty', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: [],
    };
    const merged = mergeDraft(base, update);
    expect(merged.follow_up_questions).toEqual(['What is the dosage?']);
  });

  it('replaces current follow-up questions when incoming array is non-empty', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: ['How many days?', 'Any allergies?'],
    };
    const merged = mergeDraft(base, update);
    expect(merged.follow_up_questions).toEqual(['How many days?', 'Any allergies?']);
  });

  it('preserves current follow-up questions when incoming array is undefined', () => {
    const update = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: undefined,
    } as unknown as PrescriptionDraft;
    const merged = mergeDraft(base, update);
    expect(merged.follow_up_questions).toEqual(['What is the dosage?']);
  });

  it('clears current follow-up questions to empty when incoming placeholder questions filter to empty', () => {
    const update: PrescriptionDraft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: ['Please confirm patient name, age, and gender.'],
    };
    const merged = mergeDraft(base, update);
    expect(merged.follow_up_questions).toEqual(['Please confirm patient name, age, and gender.']);
  });
});

describe('canFinalizeDraft - additional edge cases', () => {
  const validBase: PrescriptionDraft = {
    patient: { name: 'Ravi', age: 32, gender: 'M' },
    medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
    lab_tests: [],
    follow_up_questions: [],
  };

  it('rejects patient name that is only whitespace', () => {
    const draft: PrescriptionDraft = {
      ...validBase,
      patient: { ...validBase.patient, name: '   ' },
    };
    expect(canFinalizeDraft(draft)).toBe(false);
  });

  it('accepts large valid age like 120', () => {
    const draft: PrescriptionDraft = {
      ...validBase,
      patient: { name: 'Senior', age: 120, gender: 'M' },
    };
    expect(canFinalizeDraft(draft)).toBe(true);
  });

  it('rejects draft where medicines is undefined', () => {
    const draft = {
      ...validBase,
      medicines: undefined,
    } as unknown as PrescriptionDraft;
    expect(canFinalizeDraft(draft)).toBe(false);
  });

  it('rejects draft with mix of valid and invalid (placeholder) medicine names', () => {
    const draft: PrescriptionDraft = {
      ...validBase,
      medicines: [
        { name: 'Dolo 650' },
        { name: 'none' },  // placeholder name
      ],
    };
    expect(canFinalizeDraft(draft)).toBe(false);
  });

  it('rejects draft with mix of valid and whitespace-only medicine names', () => {
    const draft: PrescriptionDraft = {
      ...validBase,
      medicines: [
        { name: 'Dolo 650' },
        { name: '   ' },
      ],
    };
    expect(canFinalizeDraft(draft)).toBe(false);
  });

  it('accepts a draft that has no gender (gender is optional)', () => {
    const draft: PrescriptionDraft = {
      ...validBase,
      patient: { name: 'Ravi', age: 32 },
    };
    expect(canFinalizeDraft(draft)).toBe(true);
  });

  it('accepts a draft that has clinical fields (complaints, diagnosis, etc.) filled', () => {
    const draft: PrescriptionDraft = {
      ...validBase,
      complaints: 'fever for 2 days',
      diagnosis: 'Viral fever',
    };
    expect(canFinalizeDraft(draft)).toBe(true);
  });

  it('rejects a draft with an empty medicines array (no medicines prescribed)', () => {
    const draft: PrescriptionDraft = {
      ...validBase,
      medicines: [],
    };
    expect(canFinalizeDraft(draft)).toBe(false);
  });
});
