import type { DoctorProfile } from '../schemas/profile';

export type SignatureFont = 'Dancing Script' | 'Great Vibes' | 'Caveat' | 'Satisfy';
export type SignatureStyle = 'initials' | 'lastName' | 'fullName';

export const SIGNATURE_FONTS: SignatureFont[] = ['Dancing Script', 'Great Vibes', 'Caveat', 'Satisfy'];

export function deriveSignatureText(fullName: string, style: SignatureStyle): string {
  const parts = fullName.trim().split(/\s+/);
  switch (style) {
    case 'initials':
      return parts.map((p) => p[0].toUpperCase() + '.').join('');
    case 'lastName':
      return parts[parts.length - 1];
    case 'fullName':
    default:
      return fullName.trim();
  }
}

async function ensureFontLoaded(font: SignatureFont): Promise<void> {
  const testStr = 'ABCabc';
  try {
    await document.fonts.load(`32px "${font}"`, testStr);
  } catch {
    // Font may already be loaded or unavailable; continue anyway
  }
}

export async function generateSignature(profile: DoctorProfile): Promise<string> {
  const font = profile.signatureFont || 'Dancing Script';
  const style = profile.signatureStyle || 'fullName';
  const text = deriveSignatureText(profile.fullName, style);

  await ensureFontLoaded(font);

  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 300, 80);
  ctx.fillStyle = '#1e3a5f';
  ctx.font = `32px "${font}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 150, 45);

  return canvas.toDataURL('image/png');
}
