import { describe, it, expect } from 'vitest';
import { MedicineSchema, PrescriptionDraftSchema } from '../schemas/prescription';

describe('Prescription Schema', () => {
  it('should validate a valid medicine', () => {
    const validMed = {
      name: 'Dolo 650',
      genericName: 'Paracetamol',
      dosage: '650mg',
      frequency: '1-0-1',
      duration: '3 days'
    };
    const result = MedicineSchema.safeParse(validMed);
    expect(result.success).toBe(true);
  });

  it('should validate a valid prescription draft with diagnosis', () => {
    const validDraft = {
      patient: { name: 'John Doe', age: 30, gender: 'M' },
      diagnosis: 'Viral Fever',
      medicines: [
        { name: 'Dolo 650', genericName: 'Paracetamol', dosage: '650mg' }
      ],
      lab_tests: ['CBC'],
      notes: 'Rest well',
      follow_up_questions: []
    };
    const result = PrescriptionDraftSchema.safeParse(validDraft);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.diagnosis).toBe('Viral Fever');
    }
  });
});
