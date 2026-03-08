import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePrescriptionUpdate } from '../lib/gemini';

const generateObjectMock = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => () => ({ provider: 'gemini-model' }),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => () => ({ provider: 'openrouter-model' }),
}));

describe('Gemini parser behavior', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('includes explicit demographic parsing instructions in the system prompt', async () => {
    generateObjectMock.mockResolvedValue({
      object: { patient: {}, medicines: [], lab_tests: [], follow_up_questions: [] },
    });

    await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Ayush 30 M' });

    const call = generateObjectMock.mock.calls[0][0];
    expect(call.system).toContain('Name Age Gender');
    expect(call.system).toContain('Do not interpret demographics as medicine');
    expect(call.messages[0].content[1].text).toContain('Ayush 30 M');
  });

  it('corrects demographic-only text when model misclassifies it as a medicine', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        patient: {},
        medicines: [{ name: 'Ayush 30mg', dosage: '30mg' }],
        lab_tests: [],
        follow_up_questions: [],
      },
    });

    const parsed = await parsePrescriptionUpdate('gemini', 'fake-key', null, {
      type: 'text',
      text: 'Ayush 30 M',
    });

    expect(parsed.patient).toEqual({ name: 'Ayush', age: 30, gender: 'M' });
    expect(parsed.medicines).toEqual([]);
    expect(parsed.follow_up_questions).toContain('Please confirm patient name, age, and gender.');
  });
});
