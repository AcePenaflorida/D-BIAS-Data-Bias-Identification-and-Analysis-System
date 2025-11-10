
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import path from 'path';

  export default defineConfig({
    plugins: [react()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'build',
    },
    server: {
      port: 3000,
      open: true,
      // Use polling for file watching on platforms where native watchers are unreliable
      // (OneDrive, some Windows setups, or locked files). Polling is slightly heavier
      // but avoids EPERM/rename failures when chokidar/watchdog can't use native APIs.
      watch: {
        usePolling: true,
        interval: 1000, // ms between polls
      },
    },
  });