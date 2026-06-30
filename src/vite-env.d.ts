/// <reference types="vite/client" />

interface GleitoApi {
  loadDb: () => Promise<Uint8Array | null>;
  saveDb: (bytes: Uint8Array) => Promise<string>;
  exportBackup: (bytes: Uint8Array, suggestedName: string) => Promise<string | null>;
  importBackup: () => Promise<Uint8Array | null>;
  exportPdf: (html: string, suggestedName: string) => Promise<string | null>;
  getVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<boolean>;
}

interface Window {
  gleito?: GleitoApi;
}
