/**
 * Storage repository for ScribRx.
 *
 * Exposes the same surface as `db.ts` so pages can swap their imports without
 * other changes. When a PocketBase backend is configured AND the user is signed
 * in AND the device is online, reads/writes go to PocketBase and are mirrored to
 * IndexedDB as an offline cache. Otherwise everything falls back to IndexedDB —
 * which is also the original, fully-local behaviour when no backend is set.
 *
 * Device-specific config (active draft, BYOK keys, provider choice) always stays
 * in IndexedDB and is re-exported unchanged.
 */
import { pb, isAuthed } from './pb';
import * as local from './db';
import type { Prescription } from '../schemas/prescription';
import type { DoctorProfile } from '../schemas/profile';

// Config helpers are device-local; pass straight through.
export const saveConfig = local.saveConfig;
export const getConfig = local.getConfig;
export const initDB = local.initDB;

/** Use the cloud backend only when configured, authenticated, and online. */
function useCloud(): boolean {
  return isAuthed() && navigator.onLine;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join('.');
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const PROFILE_FIELDS: (keyof DoctorProfile)[] = [
  'fullName', 'designation', 'regNumber', 'clinicName', 'phone',
  'stampBase64', 'hmacSecret', 'signatureFont', 'signatureStyle', 'signatureBase64',
];

function recordToProfile(rec: Record<string, unknown>): DoctorProfile {
  const out: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) {
    const v = rec[f as string];
    if (v !== undefined && v !== null && v !== '') out[f as string] = v;
  }
  return out as DoctorProfile;
}

export async function saveProfile(profile: DoctorProfile): Promise<void> {
  // Always keep a local copy for offline use.
  await local.saveProfile(profile);
  if (!useCloud()) return;

  const userId = pb.authStore.record?.id;
  const data: Record<string, unknown> = { user: userId };
  for (const f of PROFILE_FIELDS) data[f as string] = (profile as Record<string, unknown>)[f as string] ?? '';

  const existing = await pb.collection('profiles')
    .getFirstListItem(`user="${userId}"`)
    .catch(() => null);

  if (existing) {
    await pb.collection('profiles').update(existing.id, data);
  } else {
    await pb.collection('profiles').create(data);
  }
}

export async function getProfile(): Promise<DoctorProfile | null> {
  if (useCloud()) {
    try {
      const userId = pb.authStore.record?.id;
      const rec = await pb.collection('profiles').getFirstListItem(`user="${userId}"`);
      const profile = recordToProfile(rec as unknown as Record<string, unknown>);
      await local.saveProfile(profile); // refresh cache
      return profile;
    } catch {
      // fall through to local cache (e.g. not created yet / offline race)
    }
  }
  return local.getProfile();
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

const STRUCTURED_KEYS = [
  'patient', 'complaints', 'symptoms', 'examination',
  'diagnosis', 'medicines', 'labTests', 'notes', 'qrPayload',
] as const;

async function prescriptionToFormData(rx: Prescription): Promise<FormData> {
  const userId = pb.authStore.record?.id ?? '';
  const profile = await local.getProfile();

  const data: Record<string, unknown> = {};
  const rxRecord = rx as unknown as Record<string, unknown>;
  for (const k of STRUCTURED_KEYS) {
    const v = rxRecord[k];
    if (v !== undefined) data[k] = v;
  }

  const fd = new FormData();
  fd.append('user', userId);
  fd.append('rxId', rx.id);
  fd.append('status', rx.status);
  fd.append('createdAt', rx.createdAt);
  if (rx.finalizedAt) fd.append('finalizedAt', rx.finalizedAt);
  if (rx.cancelledAt) fd.append('cancelledAt', rx.cancelledAt);
  fd.append('data', JSON.stringify(data));
  // Public-safe verification fields (read via the hosted /api/verify route).
  fd.append('doctorName', profile?.fullName ?? '');
  fd.append('regNo', profile?.regNumber ?? '');
  fd.append('patientInitials', getInitials(rx.patient?.name ?? ''));
  if (rx.pdfBlob) fd.append('pdf', rx.pdfBlob, `${rx.id}.pdf`);
  return fd;
}

function recordToPrescription(rec: Record<string, any>): Prescription {
  const data = (rec.data ?? {}) as Record<string, unknown>;
  const pdfUrl = rec.pdf ? pb.files.getURL(rec as any, rec.pdf as string) : undefined;
  return {
    id: rec.rxId,
    status: rec.status,
    createdAt: rec.createdAt,
    finalizedAt: rec.finalizedAt || undefined,
    cancelledAt: rec.cancelledAt || undefined,
    patient: (data.patient as Prescription['patient']) ?? { name: '', age: 0, gender: 'M' },
    complaints: data.complaints as string | undefined,
    symptoms: data.symptoms as string | undefined,
    examination: data.examination as string | undefined,
    diagnosis: data.diagnosis as string | undefined,
    medicines: (data.medicines as Prescription['medicines']) ?? [],
    labTests: (data.labTests as string[]) ?? [],
    notes: data.notes as string | undefined,
    qrPayload: data.qrPayload as string | undefined,
    pdfUrl,
  };
}

export async function savePrescription(rx: Prescription): Promise<void> {
  await local.savePrescription(rx); // cache + offline source of truth
  if (!useCloud()) return;

  const fd = await prescriptionToFormData(rx);
  const existing = await pb.collection('prescriptions')
    .getFirstListItem(`rxId="${rx.id}"`)
    .catch(() => null);

  if (existing) {
    await pb.collection('prescriptions').update(existing.id, fd);
  } else {
    await pb.collection('prescriptions').create(fd);
  }
}

export async function getPrescription(id: string): Promise<Prescription | null> {
  if (useCloud()) {
    try {
      const rec = await pb.collection('prescriptions').getFirstListItem(`rxId="${id}"`);
      const rx = recordToPrescription(rec as unknown as Record<string, any>);
      const cached = await local.getPrescription(id);
      if (cached?.pdfBlob) rx.pdfBlob = cached.pdfBlob;
      return rx;
    } catch {
      // fall through
    }
  }
  return local.getPrescription(id);
}

export async function listPrescriptions(status?: string): Promise<Prescription[]> {
  if (useCloud()) {
    try {
      const filter = status ? `status="${status}"` : '';
      const recs = await pb.collection('prescriptions').getFullList({
        filter,
        sort: '-createdAt',
      });
      // Merge any locally-cached PDF blobs so same-device re-share keeps working.
      const cached = await local.listPrescriptions();
      const blobById = new Map(cached.map((c) => [c.id, c.pdfBlob]));
      return recs.map((r) => {
        const rx = recordToPrescription(r as unknown as Record<string, any>);
        const blob = blobById.get(rx.id);
        if (blob) rx.pdfBlob = blob;
        return rx;
      });
    } catch {
      // fall through to local
    }
  }
  return local.listPrescriptions(status);
}

/**
 * Ensures a prescription's PDF Blob is available, lazily fetching it from the
 * remote `pdfUrl` for records that were synced from another device.
 */
export async function ensurePdfBlob(rx: Prescription): Promise<Prescription> {
  if (rx.pdfBlob) return rx;
  if (rx.pdfUrl) {
    try {
      const res = await fetch(rx.pdfUrl);
      const blob = await res.blob();
      return { ...rx, pdfBlob: blob };
    } catch {
      // ignore — caller handles missing blob
    }
  }
  return rx;
}

export async function getNextRxId(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  if (useCloud()) {
    try {
      // Find the highest counter already used today for this doctor.
      const recs = await pb.collection('prescriptions').getFullList({
        filter: `rxId~"RX-${dateStr}-"`,
        fields: 'rxId',
      });
      let max = 0;
      for (const r of recs) {
        const m = /-(\d+)$/.exec((r as any).rxId ?? '');
        if (m) max = Math.max(max, Number(m[1]));
      }
      return `RX-${dateStr}-${String(max + 1).padStart(4, '0')}`;
    } catch {
      // fall through to local counter
    }
  }
  return local.getNextRxId();
}

export async function resetDB(): Promise<void> {
  await local.resetDB();
}
