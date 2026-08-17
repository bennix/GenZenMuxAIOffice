import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    // @genoffice/* workspace packages ship TS source (no build step, no
    // compiled entry point) — externalizing them makes Node's ESM loader try
    // to resolve their relative imports at runtime and fail. Bundle those;
    // externalize everything else (Electron, zod, node builtins).
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@genoffice/ai-provider',
          '@genoffice/agent-core',
          '@genoffice/ai-search',
          '@genoffice/docx-engine',
          '@genoffice/file-parse',
          '@genoffice/electron-utils',
          '@genoffice/i18n',
          'alasql',
        ],
      }),
    ],
    resolve: {
      // The package's Node entry imports react-native-fs. SQL runs against
      // in-memory tables only, so bundle the browser build into the desktop
      // main process and keep the installer self-contained.
      alias: { alasql: resolve(__dirname, '../../node_modules/alasql/dist/alasql.js') },
    },
  },
  preload: {
    // Sandboxed preload scripts cannot require arbitrary npm packages at runtime.
    plugins: [externalizeDepsPlugin({ exclude: ['@genoffice/electron-utils'] })],
  },
  renderer: {
    plugins: [react()],
  },
})
