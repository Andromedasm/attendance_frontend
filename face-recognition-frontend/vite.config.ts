import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';


export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0', // 使得可以通过网络访问
        port: 5173,
        proxy: {
            '/api': {
                target: 'https://insightface.japaneast.cloudapp.azure.com:5000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    build: {
        outDir: 'build',
    },
});
