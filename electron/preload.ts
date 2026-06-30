import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gleito', {
  loadDb: async (): Promise<Uint8Array | null> => {
    const result = await ipcRenderer.invoke('db:load');
    if (!result) return null;
    return new Uint8Array(result);
  },
  saveDb: async (bytes: Uint8Array): Promise<string> => ipcRenderer.invoke('db:save', bytes),
  exportBackup: async (bytes: Uint8Array, suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke('backup:export', bytes, suggestedName),
  importBackup: async (): Promise<Uint8Array | null> => {
    const result = await ipcRenderer.invoke('backup:import');
    if (!result) return null;
    return new Uint8Array(result);
  },
  exportPdf: async (html: string, suggestedName: string): Promise<string | null> =>
    ipcRenderer.invoke('pdf:export', html, suggestedName),
  getVersion: async (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  openExternal: async (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url)
});
