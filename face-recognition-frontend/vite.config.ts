import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: [
      'axios',
      '@fortawesome/react-fontawesome',
      '@fortawesome/fontawesome-free/css/all.min.css'
    ],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      external: [
        '@fortawesome/fontawesome-free/css/all.min.css'
      ],
    },
  },
});
