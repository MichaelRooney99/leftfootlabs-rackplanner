import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Mirrors the capstone's BFF-proxy pattern at the dev-server level —
      // frontend talks to /api, Vite forwards to the real Express port.
      "/api": "http://localhost:3002",
    },
  },
});
