import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const EXCEL_VENDOR_PACKAGES = [
  'archiver',
  'dayjs',
  'fast-csv',
  'jszip',
  'pako',
  'readable-stream',
  'saxes',
  'xmlchars',
  'zip-stream'
];

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/node_modules/exceljs/') || id.includes('\\node_modules\\exceljs\\')) {
            return 'exceljs';
          }
          if (EXCEL_VENDOR_PACKAGES.some((pkg) => id.includes(`/node_modules/${pkg}/`) || id.includes(`\\node_modules\\${pkg}\\`))) {
            return 'excel-support';
          }
          return 'vendor';
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
