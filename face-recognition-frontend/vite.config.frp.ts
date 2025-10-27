import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    https: {
      key: fs.readFileSync('/etc/ssl/key.pem'), // 直接引用 /etc/ssl/key.pem
      cert: fs.readFileSync('/etc/ssl/cert.pem'), // 直接引用 /etc/ssl/cert.pem
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', 
        changeOrigin: true,
        secure: false,
        xfwd: true,
      },
    },
  },  
})
