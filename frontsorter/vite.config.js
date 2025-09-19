import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Assuming Vite runs on default 5173 and Rust on 8081
    port: 5173, // Optional: explicitly set Vite's port if needed
    historyApiFallback: true, // Enable SPA fallback for client-side routing
    proxy: {
      // Proxy requests starting with /api to your Rust backend
      '/api': {
        target: 'http://127.0.0.1:8081', // Your Rust backend address
        changeOrigin: true, // Recommended, helps with backend validation/virtual hosts
        // If your Rust routes *don't* start with /api, uncomment and adjust the rewrite:
        // rewrite: (path) => path.replace(/^\/api/, ''),
      }
      // Removed /spotify proxy - this should be handled by React Router, not the backend
      // You can add other backend proxy rules here if needed
      // '/auth': { ... }
    }
  }
})