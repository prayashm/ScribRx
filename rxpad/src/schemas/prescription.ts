import { z } from 'zod';

const PLACEHOLDER_VALUES = new Set([
  'string',
  'unknown',
  'undefined',
  'null',
  'n/a',
  'na',
  'none',
]);

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_VALUES.has(value.trim().toLowerCase());
}

function normalizeOptionalString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || isPlaceholder(trimmed)) return undefined;
  return trimmed;
}

function normalizeRequiredString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed;
}

function normalizeStringList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !isPlaceholder(item));
}

const OptionalStringSchema = z.preprocess(normalizeOptionalString, z.string().optional());
const RequiredNameSchema = z.preprocess(normalizeRequiredString, z.string().min(1).refine((v) => !isPlaceholder(v), 'Invalid placeholder value'));

export const MedicineSchema = z.object({
  name: RequiredNameSchema.describe('Medicine name - Indian brand name or generic name. REQUIRED.'),
  genericName: OptionalStringSchema.describe('Optional generic (INN) name of the medicine. E.g. "Paracetamol" for Dolo.'),
  dosage: OptionalStringSchema.describe('Dosage amount, e.g. "500mg", "650mg", "10ml". Leave empty if not mentioned.'),
  frequency: OptionalStringSchema.describe('Dosing frequency. Indian convention: "1-0-1" means morning-skip-evening. Also accept: OD, BD, TDS, SOS, HS. Leave empty if not mentioned.'),
  duration: OptionalStringSchema.describe('Duration of course, e.g. "3 days", "5 days", "1 week". Leave empty if not mentioned.'),
  instructions: OptionalStringSchema.describe('Optional instructions, e.g. "after food", "before bed", "empty stomach"'),
});

export const PatientSchema = z.object({
  name: OptionalStringSchema.describe('Full name of the patient. Leave empty if not mentioned.'),
  age: z.number().int().positive().optional().describe('Age in years. Leave empty if not mentioned.'),
  gender: z.enum(['M', 'F', 'Other']).optional().describe('Gender. Leave empty if not mentioned.'),
  phone: OptionalStringSchema.describe('Phone number (optional)'),
});

export const PrescriptionDraftSchema = z.object({
  patient: PatientSchema.default({}),
  complaints: OptionalStringSchema.describe('Chief complaints in patient\'s own words, e.g. "fever and sore throat for 3 days", "headache and vomiting". Leave empty if not mentioned.'),
  symptoms: OptionalStringSchema.describe('Symptoms and signs observed, e.g. "fever 102F, pharyngeal erythema, mild tachycardia". Leave empty if not mentioned.'),
  examination: OptionalStringSchema.describe('Clinical examination findings, e.g. "throat red, tonsils enlarged", "BP 130/80, chest clear". Optional - leave empty if not mentioned.'),
  diagnosis: OptionalStringSchema.describe('Clinical diagnosis or provisional diagnosis, e.g. "Acute pharyngitis", "Type 2 DM", "URTI". Leave empty if not mentioned.'),
  medicines: z.array(MedicineSchema).default([]).describe('List of prescribed medicines'),
  lab_tests: z.preprocess(normalizeStringList, z.array(z.string()).default([])).describe('Lab tests to order, e.g. "CBC", "Lipid Profile", "HbA1c"'),
  notes: OptionalStringSchema.describe('Additional instructions for the patient'),
  follow_up_questions: z.preprocess(normalizeStringList, z.array(z.string()).default([])).describe('Questions to ask the doctor about missing critical info. E.g. "What is the dosage for Amoxicillin?", "How many days should Paracetamol be taken?", "Patient name?". Only ask about genuinely missing info, not optional fields like instructions.'),
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
  complaints?: string;
  symptoms?: string;
  examination?: string;
  diagnosis?: string;
  medicines: Medicine[];
  labTests: string[];
  notes?: string;
  pdfBlob?: Blob;
  /** Remote URL of the stored PDF when synced via PocketBase (lazy-loaded into pdfBlob). */
  pdfUrl?: string;
  qrPayload?: string;
}
