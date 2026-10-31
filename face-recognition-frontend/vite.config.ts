import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/facerecognition/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: [
      "shiroyama.japaneast.cloudapp.azure.com",
    ],
  },
  build: {
    outDir: 'build',
  },
});
