import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { PrescriptionDraftSchema } from '../schemas/prescription';
import type { PrescriptionDraft } from '../schemas/prescription';

export type AIProvider = 'gemini' | 'openrouter';

function getGeminiModel(apiKey: string) {
  const google = createGoogleGenerativeAI({ apiKey });
  return google('gemini-2.5-flash');
}

function getOpenRouterModel(apiKey: string) {
  const openrouter = createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': window.location.origin,
      'X-Title': 'ScribRx',
    },
  });
  return openrouter('google/gemini-2.0-flash-001');
}

export function getModel(provider: AIProvider, apiKey: string) {
  return provider === 'openrouter' ? getOpenRouterModel(apiKey) : getGeminiModel(apiKey);
}

const PLACEHOLDER_VALUES = new Set(['string', 'unknown', 'undefined', 'null', 'n/a', 'na', 'none']);

function isMeaningful(value?: string): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !PLACEHOLDER_VALUES.has(trimmed.toLowerCase());
}

function cleanText(value?: string): string | undefined {
  return isMeaningful(value) ? value.trim() : undefined;
}

function normalizeGender(raw: string): 'M' | 'F' | 'Other' {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'm' || normalized === 'male') return 'M';
  if (normalized === 'f' || normalized === 'female') return 'F';
  return 'Other';
}

function extractDemographics(text: string): { name: string; age: number; gender: 'M' | 'F' | 'Other' } | null {
  const match = text.match(/^\s*([A-Za-z][A-Za-z .'-]{0,60})\s+(\d{1,3})\s+(M|F|Male|Female|Other)\s*$/i);
  if (!match) return null;

  const name = match[1].trim();
  const age = Number(match[2]);
  const gender = normalizeGender(match[3]);

  if (!name || age <= 0 || age > 120) return null;
  return { name, age, gender };
}

function sanitizeDraft(draft: PrescriptionDraft): PrescriptionDraft {
  return {
    patient: {
      name: cleanText(draft.patient?.name),
      age: draft.patient?.age,
      gender: draft.patient?.gender,
      phone: cleanText(draft.patient?.phone),
    },
    complaints: (draft.complaints || []).map((test) => test?.trim?.() || '').filter((test) => isMeaningful(test)),
    symptoms: (draft.symptoms || []).map((test) => test?.trim?.() || '').filter((test) => isMeaningful(test)),
    signs: (draft.signs || []).map((test) => test?.trim?.() || '').filter((test) => isMeaningful(test)),
    examination: cleanText(draft.examination),
    diagnosis: cleanText(draft.diagnosis),
    medicines: (draft.medicines || [])
      .map((med) => ({
        ...med,
        name: cleanText(med.name) || '',
        genericName: cleanText(med.genericName),
        dosage: cleanText(med.dosage),
        frequency: cleanText(med.frequency),
        duration: cleanText(med.duration),
        instructions: cleanText(med.instructions),
      }))
      .filter((med) => isMeaningful(med.name)),
    lab_tests: (draft.lab_tests || []).map((test) => test?.trim?.() || '').filter((test) => isMeaningful(test)),
    notes: cleanText(draft.notes),
    follow_up_questions: (draft.follow_up_questions || [])
      .map((q) => q?.trim?.() || '')
      .filter((q) => isMeaningful(q)),
  };
}

function applyDemographicHeuristic(draft: PrescriptionDraft, inputText: string): PrescriptionDraft {
  const demographics = extractDemographics(inputText);
  if (!demographics) return draft;

  const hasPatientData = isMeaningful(draft.patient?.name) || !!draft.patient?.age;
  if (hasPatientData) return draft;

  const medicines = draft.medicines || [];
  const suspiciousMedicine = medicines.length === 1 && medicines[0].name.toLowerCase().includes(demographics.name.toLowerCase());

  if (medicines.length === 0 || suspiciousMedicine) {
    const followUps = new Set(draft.follow_up_questions || []);
    followUps.add('Please confirm patient name, age, and gender.');

    return {
      ...draft,
      patient: {
        ...draft.patient,
        name: demographics.name,
        age: demographics.age,
        gender: demographics.gender,
      },
      medicines: suspiciousMedicine ? [] : medicines,
      follow_up_questions: Array.from(followUps),
    };
  }

  return draft;
}

const SYSTEM_PROMPT = `You are a medical prescription assistant for qualified Indian doctors.
You parse the doctor's voice notes or text messages into structured prescription data.

Rules:
- Clinical Info Extraction:
    * Complaints: Patient's reported issues (e.g., "Fever for 2 days", "Body ache").
    * Symptoms: Specific clinical symptoms mentioned (e.g., "Nausea", "Fatigue").
    * Signs: Clinical signs found by the doctor (e.g., "Pallor", "Icterus").
    * Examination: Physical findings (e.g., "BP 120/80", "Chest clear").
    * Diagnosis: The provisional or final clinical diagnosis (e.g., "Acute pharyngitis").
- Medicines: Do not omit medicines when clinical info is provided. Merge updates with the current state.
- Name Age Gender pattern: if text looks like "Name Age Gender" (example: "Ayush 30 M"), treat it as patient demographics.
- Do not interpret demographics as medicine names or dosages.
- Use Indian medicine naming conventions (brand names like Azee, Dolo, Crocin are valid).
- When a brand name is used, ALWAYS fill in the genericName field with the INN/generic equivalent (e.g. Dolo -> Paracetamol).
- "1-0-1" means morning-skip-evening.
- OD = once daily, BD = twice daily, TDS = thrice daily, QID = four times daily, SOS = as needed, HS = at bedtime.
- "x/7" notation: "3/7" means "3 days".
- Preserve ALL existing prescription data unless the doctor explicitly changes it.
- NEVER guess or invent information. Leave fields empty if not mentioned.
- NEVER put explanations or reasoning in any field.
- The 'notes' field is for patient-facing advice (e.g. 'Drink plenty of water').
- In follow_up_questions, ask about critical missing info (dosage, frequency, duration; patient name).`;

export async function parsePrescriptionUpdate(
  provider: AIProvider,
  apiKey: string,
  currentState: PrescriptionDraft | null,
  input: { type: 'audio'; data: string; mimeType: string } | { type: 'text'; text: string }
): Promise<PrescriptionDraft> {
  const model = getModel(provider, apiKey);

  const userContent: Array<{ type: string; text?: string; data?: string; mimeType?: string; mediaType?: string }> = [];

  if (currentState) {
    userContent.push({
      type: 'text',
      text: `Current prescription state:\n${JSON.stringify(currentState, null, 2)}\n\nThe doctor has provided an update. Merge it with the existing state.`,
    });
  } else {
    userContent.push({
      type: 'text',
      text: 'The doctor is starting a new prescription. Parse the following into a complete prescription.',
    });
  }

  if (input.type === 'audio') {
    userContent.push({
      type: 'file',
      data: input.data,
      mediaType: input.mimeType,
    });
  } else {
    userContent.push({
      type: 'text',
      text: `Doctor's update: "${input.text}"`,
    });
  }

  const { object } = await generateObject({
    model,
    schema: PrescriptionDraftSchema,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent as any }],
  });

  const sanitized = sanitizeDraft(object);
  if (input.type === 'text') {
    return applyDemographicHeuristic(sanitized, input.text);
  }
  return sanitized;
}

export async function testApiKey(provider: AIProvider, apiKey: string): Promise<boolean> {
  try {
    const model = getModel(provider, apiKey);
    const { z } = await import('zod');
    await generateObject({
      model,
      schema: z.object({ ok: z.boolean() }),
      prompt: 'Return ok: true',
    });
    return true;
  } catch {
    return false;
  }
}
