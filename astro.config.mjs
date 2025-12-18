import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  base: "/",
  build: {
    assetsPrefix: "/app",
  },
  security: {
    checkOrigin: false,
  },
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),

  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Allow ngrok and other tunnel hosts in development
      // The dot prefix (e.g., ".ngrok-free.app") allows all subdomains
      allowedHosts: [
        "localhost",
        ".localhost",
        ".ngrok.io",
        ".ngrok-free.app",
        ".ngrok.app",
        ".loca.lt", // localtunnel
        ".serveo.net", // serveo
        "webflow.io"
      ],
      // Alternative: Allow all hosts in development (uncomment if needed)
      // This is less secure but works with any tunnel service
      // host: true,
    },
    resolve: {
      // Use react-dom/server.edge instead of react-dom/server.browser for React 19.
      // Without this, MessageChannel from node:worker_threads needs to be polyfilled.
      alias: import.meta.env.PROD
        ? {
            "react-dom/server": "react-dom/server.edge",
          }
        : undefined,
    },
  },
});
