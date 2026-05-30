import QRCode from 'qrcode';
import type { Prescription } from '../schemas/prescription';
import type { DoctorProfile } from '../schemas/profile';
import { pocketBaseEnabled } from './pb';

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join('.');
}

export async function signPrescription(
  rx: Prescription,
  profile: DoctorProfile
): Promise<string> {
  const payload = {
    rxId: rx.id,
    doctorName: profile.fullName,
    regNo: profile.regNumber,
    date: rx.finalizedAt || rx.createdAt,
    patientInitials: getInitials(rx.patient.name || ''),
    status: rx.status,
  };

  if (!profile.hmacSecret) {
    return JSON.stringify({ ...payload, hmac: '' });
  }

  const key = await crypto.subtle.importKey(
    'raw',
    hexToBuffer(profile.hmacSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );

  return JSON.stringify({ ...payload, hmac: bufferToHex(signature) });
}

export async function generateQRCode(payload: string, rxId?: string): Promise<string> {
  // Cloud mode: encode just the prescription id and verify server-side (the
  // server is the source of truth). Local mode: embed the HMAC-signed payload.
  const url = pocketBaseEnabled && rxId
    ? `${window.location.origin}/verify?id=${encodeURIComponent(rxId)}`
    : `${window.location.origin}/verify?data=${encodeURIComponent(btoa(payload))}`;
  return QRCode.toDataURL(url, { width: 120, margin: 1 });
}

export function generateHmacSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bufferToHex(bytes.buffer);
}
