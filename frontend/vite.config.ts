import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend runs stateless on :8000 (see backend/README or backend/app/main.py).
// The dev proxy avoids CORS friction and gives the frontend a stable "/api" base
// that also works unmodified if both are ever served behind the same host.
export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works under GitHub Pages' /<repo-name>/ subpath
  // without hardcoding the repo name.
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
