import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// API_URL: where the Hono API runs in development (server/dev.ts).
const apiUrl = process.env.API_URL ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin /api in dev, like production on Vercel. The API checks that a write's
    // Origin matches the host the browser used, so pass that host through the proxy.
    proxy: {
      "/api": {
        target: apiUrl,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.headers.host) proxyReq.setHeader("X-Forwarded-Host", req.headers.host);
          });
        },
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: apiUrl,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.headers.host) proxyReq.setHeader("X-Forwarded-Host", req.headers.host);
          });
        },
      },
    },
  },
});
