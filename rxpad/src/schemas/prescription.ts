import { z } from 'zod';

export const MedicineSchema = z.object({
  name: z.string().describe('Medicine name — Indian brand name or generic name'),
  genericName: z.string().optional().describe('Generic (INN) name of the medicine, e.g. "Paracetamol" for Dolo, "Amoxicillin" for Mox. Always provide if a brand name is used. Leave empty only if already generic.'),
  dosage: z.string().optional().describe('Dosage amount, e.g. "500mg", "650mg", "10ml". Leave empty if not mentioned.'),
  frequency: z.string().optional().describe('Dosing frequency. Indian convention: "1-0-1" means morning-skip-evening. Also accept: OD, BD, TDS, SOS, HS. Leave empty if not mentioned.'),
  duration: z.string().optional().describe('Duration of course, e.g. "3 days", "5 days", "1 week". Leave empty if not mentioned.'),
  instructions: z.string().optional().describe('Optional instructions, e.g. "after food", "before bed", "empty stomach"'),
});

export const PatientSchema = z.object({
  name: z.string().optional().describe('Full name of the patient. Leave empty if not mentioned.'),
  age: z.number().int().positive().optional().describe('Age in years. Leave empty if not mentioned.'),
  gender: z.enum(['M', 'F', 'Other']).optional().describe('Gender. Leave empty if not mentioned.'),
  phone: z.string().optional().describe('Phone number (optional)'),
});

export const PrescriptionDraftSchema = z.object({
  patient: PatientSchema.default({}),
  diagnosis: z.string().optional().describe('Clinical diagnosis or provisional diagnosis, e.g. "Acute pharyngitis", "Type 2 DM", "URTI". Leave empty if not mentioned.'),
  medicines: z.array(MedicineSchema).default([]).describe('List of prescribed medicines'),
  lab_tests: z.array(z.string()).default([]).describe('Lab tests to order, e.g. "CBC", "Lipid Profile", "HbA1c"'),
  notes: z.string().optional().describe('Additional instructions for the patient'),
  follow_up_questions: z.array(z.string()).default([]).describe('Questions to ask the doctor about missing critical info. E.g. "What is the dosage for Amoxicillin?", "How many days should Paracetamol be taken?", "Patient name?". Only ask about genuinely missing info, not optional fields like instructions.'),
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
  diagnosis?: string;
  medicines: Medicine[];
  labTests: string[];
  notes?: string;
  pdfBlob?: Blob;
  qrPayload?: string;
}
