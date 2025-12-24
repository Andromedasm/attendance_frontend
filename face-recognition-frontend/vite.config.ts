import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0', // 使得可以通过网络访问
    port: 5173,
    // https: {
    //   key: fs.readFileSync('/etc/ssl/key.pem'), // 直接引用 /etc/ssl/key.pem
    //   cert: fs.readFileSync('/etc/ssl/cert.pem'), // 直接引用 /etc/ssl/cert.pem
    // },
    proxy: {
      '/api': {
        target: 'http://172.29.122.103:8000', // Flask 后端地址
        changeOrigin: true, // 修改请求头中的 `Origin`
        secure: false, // 如果是自签名证书需要设为 false
        xfwd: true, // 传递 X-Forwarded-* 头部信息（真实客户端 IP）
      },
    },
  },
  build: {
    outDir: 'build',
  },
});

