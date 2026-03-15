import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePrescriptionUpdate, testApiKey } from '../lib/gemini';

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

describe('parsePrescriptionUpdate - currentState handling', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    generateObjectMock.mockResolvedValue({
      object: { patient: {}, medicines: [], lab_tests: [], follow_up_questions: [] },
    });
  });

  it('sends "starting a new prescription" when currentState is null', async () => {
    await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'test' });

    const call = generateObjectMock.mock.calls[0][0];
    expect(call.messages[0].content[0].text).toContain('starting a new prescription');
  });

  it('sends serialized currentState when provided', async () => {
    const currentState = {
      patient: { name: 'Ravi', age: 32, gender: 'M' as const },
      medicines: [{ name: 'Dolo 650' }],
      lab_tests: [],
      follow_up_questions: [],
    };

    await parsePrescriptionUpdate('gemini', 'fake-key', currentState, { type: 'text', text: 'add Azee 500' });

    const call = generateObjectMock.mock.calls[0][0];
    const contextText: string = call.messages[0].content[0].text;
    expect(contextText).toContain('Current prescription state');
    expect(contextText).toContain('Ravi');
    expect(contextText).toContain('Merge it with the existing state');
  });

  it("includes the doctor's input text in quotes", async () => {
    await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Ravi 30 M fever' });

    const call = generateObjectMock.mock.calls[0][0];
    const inputText: string = call.messages[0].content[1].text;
    expect(inputText).toContain('"Ravi 30 M fever"');
  });

  it('sanitizes placeholder values returned by the model before returning', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        patient: { name: 'string', age: 30, gender: 'M' },
        medicines: [{ name: 'Dolo 650', genericName: 'null', dosage: 'undefined' }],
        diagnosis: 'n/a',
        lab_tests: ['CBC', 'string'],
        follow_up_questions: [],
      },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'anything' });

    expect(result.patient.name).toBeUndefined();
    expect(result.medicines[0].genericName).toBeUndefined();
    expect(result.medicines[0].dosage).toBeUndefined();
    expect(result.diagnosis).toBeUndefined();
    expect(result.lab_tests).toEqual(['CBC']);
  });
});

describe('parsePrescriptionUpdate - audio input', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    generateObjectMock.mockResolvedValue({
      object: { patient: { name: 'Meera', age: 28, gender: 'F' }, medicines: [], lab_tests: [], follow_up_questions: [] },
    });
  });

  it('sends a file content block for audio input', async () => {
    await parsePrescriptionUpdate('gemini', 'fake-key', null, {
      type: 'audio',
      data: 'base64audiodata==',
      mimeType: 'audio/webm',
    });

    const call = generateObjectMock.mock.calls[0][0];
    const fileBlock = call.messages[0].content[1];
    expect(fileBlock.type).toBe('file');
    expect(fileBlock.data).toBe('base64audiodata==');
    expect(fileBlock.mediaType).toBe('audio/webm');
  });

  it('does NOT apply the demographic heuristic for audio inputs', async () => {
    // Model returns a suspicious medicine matching "Ravi 30 M" pattern — but audio
    // should skip the heuristic, so the result stays as-is.
    generateObjectMock.mockResolvedValue({
      object: {
        patient: {},
        medicines: [{ name: 'Ravi 30mg' }],
        lab_tests: [],
        follow_up_questions: [],
      },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, {
      type: 'audio',
      data: 'somedata',
      mimeType: 'audio/webm',
    });

    // Heuristic NOT applied: medicine stays, patient not populated from input text
    expect(result.medicines).toHaveLength(1);
    expect(result.medicines[0].name).toBe('Ravi 30mg');
    expect(result.patient.name).toBeUndefined();
  });
});

describe('parsePrescriptionUpdate - demographic heuristic cases', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('handles child patient (age 5) correctly via heuristic', async () => {
    generateObjectMock.mockResolvedValue({
      object: { patient: {}, medicines: [{ name: 'Priya 5mg' }], lab_tests: [], follow_up_questions: [] },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Priya 5 F' });

    expect(result.patient.name).toBe('Priya');
    expect(result.patient.age).toBe(5);
    expect(result.patient.gender).toBe('F');
  });

  it('accepts "Female" as full gender word via heuristic', async () => {
    generateObjectMock.mockResolvedValue({
      object: { patient: {}, medicines: [{ name: 'Mary 25mg' }], lab_tests: [], follow_up_questions: [] },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Mary 25 Female' });

    expect(result.patient.gender).toBe('F');
  });

  it('does NOT apply heuristic when text has age 0', async () => {
    generateObjectMock.mockResolvedValue({
      object: { patient: {}, medicines: [], lab_tests: [], follow_up_questions: [] },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Ravi 0 M' });

    expect(result.patient.name).toBeUndefined();
  });

  it('does NOT apply heuristic when age > 120', async () => {
    generateObjectMock.mockResolvedValue({
      object: { patient: {}, medicines: [], lab_tests: [], follow_up_questions: [] },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Ravi 200 M' });

    expect(result.patient.name).toBeUndefined();
  });

  it('does NOT apply heuristic when text starts with a number (no name)', async () => {
    generateObjectMock.mockResolvedValue({
      object: { patient: {}, medicines: [], lab_tests: [], follow_up_questions: [] },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: '30 M patient' });

    expect(result.patient.name).toBeUndefined();
  });

  it('does NOT apply heuristic when draft already has patient name', async () => {
    generateObjectMock.mockResolvedValue({
      object: { patient: { name: 'Existing Patient' }, medicines: [], lab_tests: [], follow_up_questions: [] },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Ravi 32 M' });

    // Patient name from model response is preserved, not overwritten by heuristic
    expect(result.patient.name).toBe('Existing Patient');
  });

  it('does NOT apply heuristic when model returns 2+ medicines', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        patient: {},
        medicines: [{ name: 'Ravi 32mg' }, { name: 'Dolo 650' }],
        lab_tests: [],
        follow_up_questions: [],
      },
    });

    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Ravi 32 M' });

    // Multiple medicines → heuristic NOT applied
    expect(result.medicines).toHaveLength(2);
    expect(result.patient.name).toBeUndefined();
  });

  it('does NOT apply heuristic when medicine name does not match the patient name', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        patient: {},
        medicines: [{ name: 'Azee 500' }],
        lab_tests: [],
        follow_up_questions: [],
      },
    });

    // "Ravi 32 M" matches pattern but model returns "Azee 500" (not containing "Ravi")
    const result = await parsePrescriptionUpdate('gemini', 'fake-key', null, { type: 'text', text: 'Ravi 32 M' });

    // "Azee 500" doesn't contain "ravi" → suspiciousMedicine = false, medicines.length = 1
    // But medicines.length is NOT 0 and suspiciousMedicine is false → heuristic NOT applied
    expect(result.medicines).toHaveLength(1);
    expect(result.medicines[0].name).toBe('Azee 500');
    expect(result.patient.name).toBeUndefined();
  });
});

describe('testApiKey behavior', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('returns true when the API call resolves successfully', async () => {
    generateObjectMock.mockResolvedValue({ object: { ok: true } });

    const result = await testApiKey('gemini', 'valid-key');

    expect(result).toBe(true);
  });

  it('returns false when the API call throws (invalid key)', async () => {
    generateObjectMock.mockRejectedValue(new Error('401 Unauthorized'));

    const result = await testApiKey('gemini', 'bad-key');

    expect(result).toBe(false);
  });

  it('returns false for any thrown error including network failures', async () => {
    generateObjectMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await testApiKey('openrouter', 'some-key');

    expect(result).toBe(false);
  });
});
