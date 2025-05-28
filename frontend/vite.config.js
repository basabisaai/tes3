// vite.config.js
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: {
        tailwindcss: {}
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.ngrok-free.app'],
    cors: {
      origin: '*',  // Agar semua origin bisa akses
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type']
    }
  }
});
