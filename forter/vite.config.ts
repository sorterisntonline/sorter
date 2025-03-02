import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === "development" || mode === "dev";

  return {
    plugins: [react()],
    build: {
      outDir: "../borter/resources/public/",
      minify: !isDev,
      minifySyntax: !isDev,
      sourcemap: isDev,
      rollupOptions: {
        input: "./index.html",
      },
    },
  };
});
