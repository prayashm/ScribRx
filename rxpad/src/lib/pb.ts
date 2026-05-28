import PocketBase from 'pocketbase';

/**
 * Base URL of the PocketBase backend, injected at build time via Vite env.
 * When empty, ScribRx stays in fully local mode (see `pocketBaseEnabled`).
 */
const PB_URL = (import.meta.env.VITE_PB_URL ?? '').trim();

/**
 * Whether a PocketBase backend is configured for this build. When false, all
 * cloud features (accounts, sync, AI proxy, hosted verification) are disabled
 * and the app falls back to its original IndexedDB-only / BYOK behaviour.
 */
export const pocketBaseEnabled = PB_URL.length > 0;

/**
 * Singleton PocketBase client. Safe to import even when PocketBase is not
 * configured — it just won't be used. The auth token is persisted to
 * localStorage by the SDK's default AsyncAuthStore-compatible store.
 */
export const pb = new PocketBase(PB_URL || undefined);

/** True when a backend is configured AND there's a valid, non-expired session. */
export function isAuthed(): boolean {
  return pocketBaseEnabled && pb.authStore.isValid;
}

/** The currently authenticated user record id, or null. */
export function currentUserId(): string | null {
  return isAuthed() ? pb.authStore.record?.id ?? null : null;
}

/** Subscribe to auth state changes (login/logout/token refresh). Returns an unsubscribe fn. */
export function onAuthChange(cb: () => void): () => void {
  return pb.authStore.onChange(cb);
}

/** Clears the local session. */
export function logout(): void {
  pb.authStore.clear();
}
