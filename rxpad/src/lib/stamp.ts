import type { DoctorProfile } from '../schemas/profile';

export function generateStampSVG(profile: DoctorProfile): string {
  const name = profile.fullName.toUpperCase();
  const reg = `Reg: ${profile.regNumber}`;
  const designation = profile.designation;
  const clinic = profile.clinicName || '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <path id="topArc" d="M 30,100 a 70,70 0 1,1 140,0" fill="none"/>
    <path id="bottomArc" d="M 170,100 a 70,70 0 1,1 -140,0" fill="none"/>
  </defs>
  <circle cx="100" cy="100" r="90" fill="none" stroke="#1e3a5f" stroke-width="3"/>
  <circle cx="100" cy="100" r="82" fill="none" stroke="#1e3a5f" stroke-width="1"/>
  <text font-size="11" fill="#1e3a5f" font-weight="bold" font-family="serif" letter-spacing="2">
    <textPath href="#topArc" startOffset="50%" text-anchor="middle">${escapeXml(name)}</textPath>
  </text>
  <text font-size="10" fill="#1e3a5f" font-family="serif" letter-spacing="1">
    <textPath href="#bottomArc" startOffset="50%" text-anchor="middle">${escapeXml(clinic)}</textPath>
  </text>
  <text x="100" y="92" text-anchor="middle" font-size="10" fill="#1e3a5f" font-family="serif">${escapeXml(designation)}</text>
  <text x="100" y="108" text-anchor="middle" font-size="9" fill="#1e3a5f" font-family="serif">${escapeXml(reg)}</text>
  <line x1="55" y1="115" x2="145" y2="115" stroke="#1e3a5f" stroke-width="0.5"/>
  <!-- Caduceus symbol -->
  <text x="100" y="82" text-anchor="middle" font-size="16" fill="#1e3a5f">⚕</text>
</svg>`;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function generateStamp(profile: DoctorProfile): Promise<string> {
  const svg = generateStampSVG(profile);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
}
