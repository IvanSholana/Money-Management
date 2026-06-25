import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  cacheDir: ".vite-cache",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    allowedHosts: ["monthly.localhost", "cashflow.local"],
    proxy: {
      "/api": "http://127.0.0.1:5000",
    },
  },
});
