import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import autoTypesPlugin from './plugins/auto-types.js'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    autoTypesPlugin() // 🚀 Automatic type generation from Rust backend!
  ],
  server: {
    // Assuming Vite runs on default 5173 and Rust on 8081
    port: 5173, // Optional: explicitly set Vite's port if needed
    proxy: {
      // Proxy requests starting with /api to your Rust backend
      '/api': {
        target: 'http://127.0.0.1:8081', // Your Rust backend address
        changeOrigin: true, // Recommended, helps with backend validation/virtual hosts
        // If your Rust routes *don't* start with /api, uncomment and adjust the rewrite:
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Add proxy rule for /spotify
      '/spotify': {
         target: 'http://127.0.0.1:8081', // Your Rust backend address
         changeOrigin: true,
         // No rewrite needed if the backend path also starts with /spotify
      }
      // You can add other proxy rules here if needed
      // '/auth': { ... }
    }
  }
})