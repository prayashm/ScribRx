import { describe, it, expect } from 'vitest';
import { PrescriptionDraftSchema } from '../schemas/prescription';
describe('Prescription Logic', () => {
  it('should validate how schemas behave', () => {
    const draft = {
      patient: {},
      medicines: [],
      lab_tests: [],
      follow_up_questions: []
    };
    
    const parsed = PrescriptionDraftSchema.parse(draft);
    expect(parsed).toBeDefined();
  });
});
