import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../borter/resources/public/",
    minify: false,
    minifySyntax: false,
    minifyIdentifiers: false,
    terserOptions: {
      compress: false,
      mangle: false
    },
    rollupOptions: {
      input: './index2.html'
    }
  },
});