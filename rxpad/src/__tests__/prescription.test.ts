import { describe, expect, it } from 'vitest';
import { MedicineSchema, PatientSchema, PrescriptionDraftSchema } from '../schemas/prescription';

describe('Prescription schema edge cases', () => {
  it('applies defaults for missing top-level optional collections', () => {
    const parsed = PrescriptionDraftSchema.parse({});

    expect(parsed.patient).toEqual({});
    expect(parsed.medicines).toEqual([]);
    expect(parsed.lab_tests).toEqual([]);
    expect(parsed.follow_up_questions).toEqual([]);
  });

  it('rejects medicine names that are empty or placeholder strings', () => {
    const emptyName = MedicineSchema.safeParse({ name: '   ' });
    const placeholderName = MedicineSchema.safeParse({ name: 'string' });

    expect(emptyName.success).toBe(false);
    expect(placeholderName.success).toBe(false);
  });

  it('does not coerce age from string values', () => {
    const parsed = PrescriptionDraftSchema.safeParse({
      patient: { name: 'Ayush', age: '30', gender: 'M' },
      medicines: [{ name: 'Dolo 650' }],
    });

    expect(parsed.success).toBe(false);
  });

  it('sanitizes placeholder optional string fields to undefined', () => {
    const parsed = PrescriptionDraftSchema.parse({
      patient: {
        name: 'Ravi',
        age: 32,
        gender: 'M',
        phone: 'string',
      },
      diagnosis: ' string ',
      medicines: [
        {
          name: 'Dolo 650',
          genericName: ' string ',
          dosage: ' 650mg ',
          frequency: ' ',
          duration: '3 days',
          instructions: 'undefined',
        },
      ],
      lab_tests: [' CBC ', 'string', ' '],
      notes: ' null ',
      follow_up_questions: ['What is duration?', 'string'],
    });

    expect(parsed.patient.phone).toBeUndefined();
    expect(parsed.diagnosis).toBeUndefined();
    expect(parsed.medicines[0].genericName).toBeUndefined();
    expect(parsed.medicines[0].dosage).toBe('650mg');
    expect(parsed.medicines[0].frequency).toBeUndefined();
    expect(parsed.medicines[0].instructions).toBeUndefined();
    expect(parsed.lab_tests).toEqual(['CBC']);
    expect(parsed.notes).toBeUndefined();
    expect(parsed.follow_up_questions).toEqual(['What is duration?']);
  });
});

describe('Clinical fields - complaints, symptoms, examination', () => {
  it('defaults all three clinical fields to undefined when not provided', () => {
    const parsed = PrescriptionDraftSchema.parse({});
    expect(parsed.complaints).toBeUndefined();
    expect(parsed.symptoms).toBeUndefined();
    expect(parsed.examination).toBeUndefined();
  });

  it('sanitizes placeholder complaints to undefined', () => {
    const result = PrescriptionDraftSchema.parse({ complaints: 'string' });
    expect(result.complaints).toBeUndefined();
  });

  it('sanitizes placeholder symptoms to undefined', () => {
    const result = PrescriptionDraftSchema.parse({ symptoms: 'n/a' });
    expect(result.symptoms).toBeUndefined();
  });

  it('sanitizes placeholder examination to undefined', () => {
    const result = PrescriptionDraftSchema.parse({ examination: 'null' });
    expect(result.examination).toBeUndefined();
  });

  it('preserves and trims valid complaints', () => {
    const result = PrescriptionDraftSchema.parse({ complaints: '  fever for 3 days  ' });
    expect(result.complaints).toBe('fever for 3 days');
  });

  it('preserves and trims valid symptoms', () => {
    const result = PrescriptionDraftSchema.parse({ symptoms: ' temp 102F, pharyngeal erythema ' });
    expect(result.symptoms).toBe('temp 102F, pharyngeal erythema');
  });

  it('preserves and trims valid examination findings', () => {
    const result = PrescriptionDraftSchema.parse({ examination: ' throat red, tonsils grade 2 ' });
    expect(result.examination).toBe('throat red, tonsils grade 2');
  });

  it('parses a draft with all clinical fields populated', () => {
    const parsed = PrescriptionDraftSchema.parse({
      complaints: 'headache and fever for 2 days',
      symptoms: 'temp 101F, mild tachycardia',
      examination: 'BP 120/80, chest clear',
      diagnosis: 'Viral fever',
      medicines: [{ name: 'Dolo 650' }],
    });
    expect(parsed.complaints).toBe('headache and fever for 2 days');
    expect(parsed.symptoms).toBe('temp 101F, mild tachycardia');
    expect(parsed.examination).toBe('BP 120/80, chest clear');
    expect(parsed.diagnosis).toBe('Viral fever');
  });
});

describe('PatientSchema validation', () => {
  it('parses with no fields provided (all optional)', () => {
    const result = PatientSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('parses with all fields valid', () => {
    const result = PatientSchema.safeParse({ name: 'Ravi Kumar', age: 32, gender: 'M', phone: '9876543210' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Ravi Kumar');
      expect(result.data.age).toBe(32);
      expect(result.data.gender).toBe('M');
      expect(result.data.phone).toBe('9876543210');
    }
  });

  it('accepts gender M, F, and Other', () => {
    expect(PatientSchema.safeParse({ gender: 'M' }).success).toBe(true);
    expect(PatientSchema.safeParse({ gender: 'F' }).success).toBe(true);
    expect(PatientSchema.safeParse({ gender: 'Other' }).success).toBe(true);
  });

  it('rejects unknown gender values', () => {
    expect(PatientSchema.safeParse({ gender: 'male' }).success).toBe(false);
    expect(PatientSchema.safeParse({ gender: 'female' }).success).toBe(false);
    expect(PatientSchema.safeParse({ gender: 'X' }).success).toBe(false);
  });

  it('rejects age 0', () => {
    expect(PatientSchema.safeParse({ age: 0 }).success).toBe(false);
  });

  it('rejects negative age', () => {
    expect(PatientSchema.safeParse({ age: -1 }).success).toBe(false);
  });

  it('rejects non-integer age', () => {
    expect(PatientSchema.safeParse({ age: 1.5 }).success).toBe(false);
  });

  it('rejects age as string', () => {
    expect(PatientSchema.safeParse({ age: '32' }).success).toBe(false);
  });

  it('sanitizes placeholder phone to undefined', () => {
    const result = PatientSchema.safeParse({ name: 'Ravi', age: 30, gender: 'M', phone: 'string' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeUndefined();
    }
  });

  it('sanitizes placeholder name to undefined', () => {
    const result = PatientSchema.safeParse({ name: 'unknown' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBeUndefined();
    }
  });
});

describe('MedicineSchema - full field validation', () => {
  it('parses a complete medicine with all fields', () => {
    const result = MedicineSchema.safeParse({
      name: 'Azee 500',
      genericName: 'Azithromycin',
      dosage: '500mg',
      frequency: '1-0-0',
      duration: '3 days',
      instructions: 'after food',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Azee 500');
      expect(result.data.genericName).toBe('Azithromycin');
      expect(result.data.dosage).toBe('500mg');
      expect(result.data.frequency).toBe('1-0-0');
      expect(result.data.duration).toBe('3 days');
      expect(result.data.instructions).toBe('after food');
    }
  });

  it('parses a medicine with only name (all optionals absent)', () => {
    const result = MedicineSchema.safeParse({ name: 'Dolo 650' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.genericName).toBeUndefined();
      expect(result.data.dosage).toBeUndefined();
      expect(result.data.frequency).toBeUndefined();
      expect(result.data.duration).toBeUndefined();
      expect(result.data.instructions).toBeUndefined();
    }
  });

  it('sanitizes placeholder genericName to undefined', () => {
    const result = MedicineSchema.safeParse({ name: 'Crocin', genericName: 'unknown' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.genericName).toBeUndefined();
    }
  });

  it('sanitizes placeholder frequency to undefined', () => {
    const result = MedicineSchema.safeParse({ name: 'Dolo 650', frequency: 'none' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frequency).toBeUndefined();
    }
  });

  it('sanitizes placeholder duration to undefined', () => {
    const result = MedicineSchema.safeParse({ name: 'Dolo 650', duration: 'n/a' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration).toBeUndefined();
    }
  });

  it('sanitizes placeholder instructions to undefined', () => {
    const result = MedicineSchema.safeParse({ name: 'Dolo 650', instructions: 'null' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.instructions).toBeUndefined();
    }
  });

  it('preserves valid Indian frequency shorthand OD', () => {
    const result = MedicineSchema.safeParse({ name: 'Dolo 650', frequency: 'OD' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frequency).toBe('OD');
    }
  });

  it('preserves valid frequency notation BD', () => {
    const result = MedicineSchema.safeParse({ name: 'Dolo 650', frequency: 'BD' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frequency).toBe('BD');
    }
  });

  it('preserves x/52 duration notation', () => {
    const result = MedicineSchema.safeParse({ name: 'Dolo 650', duration: '2/52' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration).toBe('2/52');
    }
  });

  it('trims whitespace from all string fields', () => {
    const result = MedicineSchema.safeParse({
      name: '  Azee 500  ',
      genericName: '  Azithromycin  ',
      dosage: '  500mg  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.genericName).toBe('Azithromycin');
      expect(result.data.dosage).toBe('500mg');
    }
  });
});

describe('PrescriptionDraftSchema - full draft validation', () => {
  it('parses a complete draft with all fields', () => {
    const result = PrescriptionDraftSchema.safeParse({
      patient: { name: 'Sita Devi', age: 45, gender: 'F', phone: '9123456789' },
      complaints: 'cough and cold for 4 days',
      symptoms: 'rhinorrhoea, mild fever',
      examination: 'throat mildly red',
      diagnosis: 'URTI',
      medicines: [
        { name: 'Azee 500', genericName: 'Azithromycin', dosage: '500mg', frequency: 'OD', duration: '3 days' },
        { name: 'Dolo 650', genericName: 'Paracetamol', dosage: '650mg', frequency: 'TDS', duration: '5 days' },
      ],
      lab_tests: ['CBC', 'CRP'],
      notes: 'Rest and plenty of fluids',
      follow_up_questions: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.medicines).toHaveLength(2);
      expect(result.data.lab_tests).toEqual(['CBC', 'CRP']);
    }
  });

  it('sanitizes placeholder notes to undefined', () => {
    const result = PrescriptionDraftSchema.parse({ notes: 'string' });
    expect(result.notes).toBeUndefined();
  });

  it('filters out placeholder and empty strings from follow_up_questions', () => {
    const result = PrescriptionDraftSchema.parse({
      follow_up_questions: ['What is the dosage?', 'string', ' ', 'n/a', 'How many days?'],
    });
    expect(result.follow_up_questions).toEqual(['What is the dosage?', 'How many days?']);
  });

  it('filters out placeholder and empty strings from lab_tests', () => {
    const result = PrescriptionDraftSchema.parse({
      lab_tests: ['CBC', 'unknown', '  ', 'Lipid Profile', 'null'],
    });
    expect(result.lab_tests).toEqual(['CBC', 'Lipid Profile']);
  });

  it('defaults to empty arrays for medicines, lab_tests, and follow_up_questions', () => {
    const result = PrescriptionDraftSchema.parse({ patient: { name: 'Ravi', age: 30, gender: 'M' } });
    expect(result.medicines).toEqual([]);
    expect(result.lab_tests).toEqual([]);
    expect(result.follow_up_questions).toEqual([]);
  });
});
