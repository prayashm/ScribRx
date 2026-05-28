/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the PocketBase backend (e.g. https://scribrx.fly.dev).
   * When empty/unset, ScribRx runs in fully local mode: IndexedDB-only storage,
   * BYOK AI keys, and client-side QR signing — exactly as the original PWA.
   */
  readonly VITE_PB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
