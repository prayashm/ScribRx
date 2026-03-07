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

const SYSTEM_PROMPT = `You are a medical prescription assistant for qualified Indian doctors.
You parse the doctor's voice notes or text messages into structured prescription data.

Rules:
- Extract both the diagnosis AND the medicines. Do not omit medicines when a diagnosis is provided.
- Use Indian medicine naming conventions (brand names like Azee, Dolo, Crocin are valid)
- When a brand name is used, ALWAYS fill in the genericName field with the INN/generic equivalent (e.g. Dolo → Paracetamol, Azee → Azithromycin, Crocin → Paracetamol, Mox → Amoxicillin). If the doctor already used the generic name, leave genericName empty.
- Extract diagnosis if the doctor mentions it (e.g. "URTI", "acute pharyngitis", "viral fever"). Do not invent a diagnosis.
- "1-0-1" means morning-skip-evening. "0-0-1" means evening only. Interpret accordingly.
- OD = once daily, BD = twice daily, TDS = thrice daily, QID = four times daily, SOS = as needed, HS = at bedtime
- "x/7" notation: "3/7" means "3 days", "5/7" means "5 days", "2/52" means "2 weeks"
- If the doctor says "Tab" assume tablet, "Cap" assume capsule, "Syp" assume syrup, "Inj" assume injection
- Preserve ALL existing prescription data unless the doctor explicitly changes it
- NEVER guess or invent information the doctor didn't say. Leave fields empty/omitted if not mentioned.
- NEVER put explanations, reasoning, or meta-commentary in any field. Fields are for prescription data ONLY.
- The 'notes' field is for patient-facing advice (e.g. 'Drink plenty of water'). Do NOT use it to explain your parsing decisions.
- Partial prescriptions are fine — fill only what was said.
- In follow_up_questions, ask about critical missing info (dosage, frequency, duration for medicines; patient name). Keep questions short and specific. Don't ask about optional fields like instructions unless clinically important.
- If the doctor's message answers a previous question, merge the answer into the existing data.`;

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

  return object;
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
