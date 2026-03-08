import { describe, expect, it } from 'vitest';
import { MedicineSchema, PrescriptionDraftSchema } from '../schemas/prescription';

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
