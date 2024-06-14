import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'build',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'public/index.html')
            }
        }
    },
    server: {
        proxy: {
            '/api': {
                target: 'https://insightface.japaneast.cloudapp.azure.com:5000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    publicDir: 'public',
    optimizeDeps: {
        exclude: [
            'axios',
            '@fortawesome/react-fontawesome',
            '@fortawesome/fontawesome-free/css/all.min.css'
        ],
    },
});
