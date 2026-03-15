import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: '/vehiculos/app/', // CRITICAL: Base path provided by backend mount
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test/setup.js',
    },
    server: {
        proxy: {
            // Proxy API requests to backend during dev
            // Proxy /api generic requests
            '/api': {
                target: 'http://localhost:4001',
                changeOrigin: true
            },
            '/vehiculos/api': {
                target: 'http://localhost:4001',
                changeOrigin: true,
                // rewrite: (path) => path.replace(/^\/vehiculos\/api/, '/api') // If backend mounted differently, but here it matches
            },
            // Also proxy /api/me for auth checks
            '/api/me': {
                target: 'http://localhost:4001',
                changeOrigin: true
            }
        }
    }
})
