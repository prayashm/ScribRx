import { z } from 'zod';

export const MedicineSchema = z.object({
  name: z.string().describe('Medicine name — Indian brand name or generic name'),
  dosage: z.string().describe('Dosage amount, e.g. "500mg", "650mg", "10ml"'),
  frequency: z.string().describe('Dosing frequency. Indian convention: "1-0-1" means morning-skip-evening. Also accept: OD (once daily), BD (twice daily), TDS (thrice daily), SOS (as needed), HS (at bedtime)'),
  duration: z.string().describe('Duration of course, e.g. "3 days", "5 days", "1 week", "2 weeks"'),
  instructions: z.string().optional().describe('Optional instructions, e.g. "after food", "before bed", "empty stomach", "with warm water"'),
});

export const PatientSchema = z.object({
  name: z.string().describe('Full name of the patient'),
  age: z.number().int().positive().describe('Age in years'),
  gender: z.enum(['M', 'F', 'Other']).describe('Gender'),
  phone: z.string().optional().describe('Phone number (optional)'),
});

export const PrescriptionDraftSchema = z.object({
  patient: PatientSchema,
  medicines: z.array(MedicineSchema).min(1).describe('List of prescribed medicines — must have at least one'),
  lab_tests: z.array(z.string()).default([]).describe('Lab tests to order, e.g. "CBC", "Lipid Profile", "HbA1c"'),
  notes: z.string().optional().describe('Additional instructions for the patient, e.g. "Drink plenty of fluids", "Follow up in 1 week"'),
});

export type Medicine = z.infer<typeof MedicineSchema>;
export type Patient = z.infer<typeof PatientSchema>;
export type PrescriptionDraft = z.infer<typeof PrescriptionDraftSchema>;

export interface Prescription {
  id: string;
  status: 'draft' | 'finalized' | 'cancelled';
  createdAt: string;
  finalizedAt?: string;
  cancelledAt?: string;
  patient: Patient;
  medicines: Medicine[];
  labTests: string[];
  notes?: string;
  pdfBlob?: Blob;
  qrPayload?: string;
}
