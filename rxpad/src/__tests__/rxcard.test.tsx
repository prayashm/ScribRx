/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/preact';
import { RxCard } from '../components/RxCard';
import { PrescriptionDraftDefault, type PrescriptionDraft } from '../schemas/prescription';

describe('RxCard rendering guards', () => {
  afterEach(() => cleanup());

  const baseDraft: PrescriptionDraft = {
    ...PrescriptionDraftDefault,
    patient: { name: 'Ravi', age: 32, gender: 'M' },
    medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
  };

  it('does not render placeholder "string" literals', () => {
    const draft: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: { name: 'string' },
      diagnosis: 'string',
      medicines: [{ name: 'string', dosage: 'string', instructions: 'string' }],
      lab_tests: ['string'],
      notes: 'string',
    };

    const { container } = render(<RxCard draft={draft} />);

    expect(screen.queryAllByText(/\bstring\b/i).length).toBe(0);
    expect(container.textContent?.toLowerCase().includes('string')).toBe(false);
  });

  it('hides optional sections when values are empty/placeholder', () => {
    const draft: PrescriptionDraft = {
      ...PrescriptionDraftDefault,
      patient: {},
      medicines: [{ name: 'Dolo 650', dosage: '650mg', frequency: '', instructions: 'undefined' }],
      lab_tests: [' ', 'null'],
      notes: ' ',
    };

    const { container } = render(<RxCard draft={draft} />);

    expect(!!screen.getByText('Dolo 650')).toBe(true);
    expect(container.textContent?.includes('🔬')).toBe(false);
    expect(container.textContent?.includes('📝')).toBe(false);
  });

  it('renders Finalize button when canFinalize=true and onFinalize is provided', () => {
    render(<RxCard draft={baseDraft} canFinalize onFinalize={() => {}} />);

    expect(screen.getByRole('button', { name: /Finalize & Share/i })).toBeDefined();
  });

  it('does not render Finalize button when canFinalize=false', () => {
    render(<RxCard draft={baseDraft} canFinalize={false} onFinalize={() => {}} />);

    expect(screen.queryByRole('button', { name: /Finalize & Share/i })).toBeNull();
  });

  it('does not render Finalize button when onFinalize is missing', () => {
    render(<RxCard draft={baseDraft} canFinalize />);

    expect(screen.queryByRole('button', { name: /Finalize & Share/i })).toBeNull();
  });

  it('shows "Generating..." when finalizing=true', () => {
    render(<RxCard draft={baseDraft} canFinalize onFinalize={() => {}} finalizing />);

    expect(screen.getByRole('button', { name: 'Generating...' })).toBeDefined();
  });
});
