/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signPrescription, generateQRCode, generateHmacSecret } from '../lib/qr';
import type { Prescription } from '../schemas/prescription';
import type { DoctorProfile } from '../schemas/profile';

const toDataURLMock = vi.hoisted(() => vi.fn());

vi.mock('qrcode', () => ({
  default: { toDataURL: toDataURLMock },
}));

vi.stubGlobal('location', { origin: 'https://scribrx.test' });

// Minimal valid prescription fixture
function makeRx(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: 'RX-0001',
    status: 'finalized',
    createdAt: '2024-01-01T10:00:00.000Z',
    finalizedAt: '2024-01-01T10:05:00.000Z',
    patient: { name: 'Ravi Kumar', age: 32, gender: 'M' },
    medicines: [{ name: 'Dolo 650', dosage: '650mg' }],
    labTests: [],
    ...overrides,
  };
}

// Minimal valid profile fixture
function makeProfile(overrides: Partial<DoctorProfile> = {}): DoctorProfile {
  return {
    fullName: 'Dr. Sanjay Gupta',
    regNumber: 'MH-12345',
    clinicName: 'City Clinic',
    clinicAddress: '123 Main St',
    phone: '9876543210',
    hmacSecret: undefined,
    ...overrides,
  };
}

describe('generateHmacSecret', () => {
  it('returns a 64-character string', () => {
    const secret = generateHmacSecret();
    expect(secret).toHaveLength(64);
  });

  it('contains only valid lowercase hex characters', () => {
    const secret = generateHmacSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different values on consecutive calls', () => {
    const a = generateHmacSecret();
    const b = generateHmacSecret();
    expect(a).not.toBe(b);
  });
});

describe('signPrescription - without hmacSecret', () => {
  it('returns parseable JSON when no hmacSecret is set', async () => {
    const profile = makeProfile({ hmacSecret: undefined });
    const json = await signPrescription(makeRx(), profile);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes empty-string hmac when no hmacSecret is set', async () => {
    const profile = makeProfile({ hmacSecret: undefined });
    const payload = JSON.parse(await signPrescription(makeRx(), profile));
    expect(payload.hmac).toBe('');
  });

  it('payload contains expected fields', async () => {
    const profile = makeProfile({ hmacSecret: undefined });
    const rx = makeRx();
    const payload = JSON.parse(await signPrescription(rx, profile));

    expect(payload.rxId).toBe('RX-0001');
    expect(payload.doctorName).toBe('Dr. Sanjay Gupta');
    expect(payload.regNo).toBe('MH-12345');
    expect(payload.status).toBe('finalized');
    expect(payload.date).toBe(rx.finalizedAt);
  });

  it('uses finalizedAt as date when present', async () => {
    const rx = makeRx({ finalizedAt: '2024-06-15T09:30:00.000Z', createdAt: '2024-06-01T00:00:00.000Z' });
    const payload = JSON.parse(await signPrescription(rx, makeProfile()));
    expect(payload.date).toBe('2024-06-15T09:30:00.000Z');
  });

  it('falls back to createdAt when finalizedAt is missing', async () => {
    const rx = makeRx({ finalizedAt: undefined, createdAt: '2024-05-20T08:00:00.000Z' });
    const payload = JSON.parse(await signPrescription(rx, makeProfile()));
    expect(payload.date).toBe('2024-05-20T08:00:00.000Z');
  });

  it('computes correct patient initials for a multi-word name', async () => {
    const rx = makeRx({ patient: { name: 'Ravi Kumar', age: 32, gender: 'M' } });
    const payload = JSON.parse(await signPrescription(rx, makeProfile()));
    expect(payload.patientInitials).toBe('R.K');
  });

  it('computes correct patient initials for a single-word name', async () => {
    const rx = makeRx({ patient: { name: 'Sita', age: 25, gender: 'F' } });
    const payload = JSON.parse(await signPrescription(rx, makeProfile()));
    expect(payload.patientInitials).toBe('S');
  });

  it('handles empty patient name gracefully', async () => {
    const rx = makeRx({ patient: { name: '', age: 30, gender: 'M' } });
    const payload = JSON.parse(await signPrescription(rx, makeProfile()));
    expect(payload.patientInitials).toBe('');
  });

  it('handles undefined patient name gracefully', async () => {
    const rx = makeRx({ patient: { name: undefined, age: 30, gender: 'M' } });
    const payload = JSON.parse(await signPrescription(rx, makeProfile()));
    expect(payload.patientInitials).toBe('');
  });
});

describe('signPrescription - with hmacSecret', () => {
  const validSecret = 'a'.repeat(64); // 32-byte key as 64-char hex

  it('returns a non-empty hmac when hmacSecret is set', async () => {
    const profile = makeProfile({ hmacSecret: validSecret });
    const payload = JSON.parse(await signPrescription(makeRx(), profile));
    expect(typeof payload.hmac).toBe('string');
    expect(payload.hmac.length).toBeGreaterThan(0);
  });

  it('hmac is a 64-character hex string (SHA-256 output)', async () => {
    const profile = makeProfile({ hmacSecret: validSecret });
    const payload = JSON.parse(await signPrescription(makeRx(), profile));
    expect(payload.hmac).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hmac for identical inputs (deterministic)', async () => {
    const profile = makeProfile({ hmacSecret: validSecret });
    const rx = makeRx();
    const payload1 = JSON.parse(await signPrescription(rx, profile));
    const payload2 = JSON.parse(await signPrescription(rx, profile));
    expect(payload1.hmac).toBe(payload2.hmac);
  });

  it('produces a different hmac when prescription ID changes', async () => {
    const profile = makeProfile({ hmacSecret: validSecret });
    const payload1 = JSON.parse(await signPrescription(makeRx({ id: 'RX-0001' }), profile));
    const payload2 = JSON.parse(await signPrescription(makeRx({ id: 'RX-0002' }), profile));
    expect(payload1.hmac).not.toBe(payload2.hmac);
  });

  it('produces a different hmac when hmacSecret changes', async () => {
    const profile1 = makeProfile({ hmacSecret: 'a'.repeat(64) });
    const profile2 = makeProfile({ hmacSecret: 'b'.repeat(64) });
    const rx = makeRx();
    const payload1 = JSON.parse(await signPrescription(rx, profile1));
    const payload2 = JSON.parse(await signPrescription(rx, profile2));
    expect(payload1.hmac).not.toBe(payload2.hmac);
  });
});

describe('generateQRCode', () => {
  beforeEach(() => {
    toDataURLMock.mockReset();
    toDataURLMock.mockResolvedValue('data:image/png;base64,mockqr');
  });

  it('calls QRCode.toDataURL with a URL containing the encoded payload', async () => {
    const payload = '{"rxId":"RX-0001","hmac":""}';
    await generateQRCode(payload);

    expect(toDataURLMock).toHaveBeenCalledOnce();
    const calledUrl: string = toDataURLMock.mock.calls[0][0];
    expect(calledUrl).toContain('https://scribrx.test/verify?data=');
  });

  it('base64-encodes the payload in the URL', async () => {
    const payload = '{"rxId":"RX-TEST"}';
    await generateQRCode(payload);

    const calledUrl: string = toDataURLMock.mock.calls[0][0];
    const encodedPart = calledUrl.split('data=')[1];
    const decoded = atob(decodeURIComponent(encodedPart));
    expect(decoded).toBe(payload);
  });

  it('returns the data URL from QRCode.toDataURL', async () => {
    const result = await generateQRCode('some-payload');
    expect(result).toBe('data:image/png;base64,mockqr');
  });
});
