import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

/**
 * The production preview sends the same security headers as Vercel (vercel.json is the one
 * source), so the device tests run against the real Content Security Policy. Over plain http
 * on localhost, the HTTPS-only parts (upgrade-insecure-requests, HSTS) are left out.
 */
const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === "/(.*)")?.headers ?? [])
    .filter((h) => h.key !== "Strict-Transport-Security")
    .map((h) => [h.key, h.key === "Content-Security-Policy" ? h.value.replace(/;\s*upgrade-insecure-requests/, "") : h.value]),
);

// API_URL: where the Hono API runs in development (server/dev.ts).
const apiUrl = process.env.API_URL ?? "http://localhost:3001";

/**
 * Oldest browsers we build for: iPhones stuck on iOS 15 (iPhone 6s/7), Android phones
 * on Chrome 87+ (late 2020, includes the WebView inside WhatsApp and other apps),
 * Samsung Internet 14+, Firefox 90+. Newer CSS (oklch colours) gets fallbacks for these.
 */
const browserTargets = ["chrome87", "edge88", "firefox90", "safari14", "ios14"];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: browserTargets,
    cssTarget: browserTargets,
  },
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
    headers: securityHeaders,
    // Lets a temporary Cloudflare quick tunnel (https://*.trycloudflare.com) reach the preview,
    // for testing on a phone: `cloudflared tunnel --url http://localhost:4173`.
    allowedHosts: [".trycloudflare.com"],
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
