import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    base: '/', // Ensure the base is set, especially if your app isn't served from the root
    build: {
        outDir: 'build',
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html')
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
});
