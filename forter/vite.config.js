import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = (mode === 'development') || (mode === 'dev');
  const isStaging = (mode === 'staging');
  const isProduction = process.env.ENVIRONMENT === 'production';

  return {
    plugins: [react()],
    build: {
      outDir: "../borter/resources/public/",
      minify: !isDev,
      minifySyntax: !isDev,
      sourcemap: isDev || isStaging,
      rollupOptions: {
        input: './index.html'
          }
    },
    define: {
      __IS_PRODUCTION__: isProduction,
    }
  };
});