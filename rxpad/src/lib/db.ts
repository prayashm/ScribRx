import { openDB, type IDBPDatabase } from 'idb';
import type { Prescription } from '../schemas/prescription';
import type { DoctorProfile } from '../schemas/profile';

const DB_NAME = 'rxpad';
const DB_VERSION = 1;

interface RxPadDB {
  prescriptions: {
    key: string;
    value: Prescription;
    indexes: {
      'by-status': string;
      'by-date': string;
    };
  };
  profile: {
    key: string;
    value: DoctorProfile;
  };
  config: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<RxPadDB>> | null = null;

export function initDB(): Promise<IDBPDatabase<RxPadDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RxPadDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('prescriptions')) {
          const rxStore = db.createObjectStore('prescriptions', { keyPath: 'id' });
          rxStore.createIndex('by-status', 'status');
          rxStore.createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile');
        }
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveProfile(profile: DoctorProfile): Promise<void> {
  const db = await initDB();
  await db.put('profile', profile, 'doctor');
}

export async function getProfile(): Promise<DoctorProfile | null> {
  const db = await initDB();
  return (await db.get('profile', 'doctor')) ?? null;
}

export async function saveConfig(key: string, value: unknown): Promise<void> {
  const db = await initDB();
  await db.put('config', value, key);
}

export async function getConfig<T>(key: string): Promise<T | null> {
  const db = await initDB();
  return ((await db.get('config', key)) as T) ?? null;
}

export async function savePrescription(rx: Prescription): Promise<void> {
  const db = await initDB();
  await db.put('prescriptions', rx);
}

export async function getPrescription(id: string): Promise<Prescription | null> {
  const db = await initDB();
  return (await db.get('prescriptions', id)) ?? null;
}

export async function listPrescriptions(status?: string): Promise<Prescription[]> {
  const db = await initDB();
  let results: Prescription[];
  if (status) {
    results = await db.getAllFromIndex('prescriptions', 'by-status', status);
  } else {
    results = await db.getAll('prescriptions');
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getNextRxId(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const counterKey = `counter-${dateStr}`;
  const db = await initDB();
  const current = ((await db.get('config', counterKey)) as number) || 0;
  const next = current + 1;
  await db.put('config', next, counterKey);
  return `RX-${dateStr}-${String(next).padStart(4, '0')}`;
}

export async function resetDB(): Promise<void> {
  const { deleteDB } = await import('idb');
  // First clear the current session reference
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await deleteDB(DB_NAME);
}
