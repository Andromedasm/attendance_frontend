import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'build', // 确保输出目录为 build
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'), // 指定 index.html 文件的位置
            },
        },
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
