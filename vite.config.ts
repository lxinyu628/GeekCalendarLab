import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      workbox: {
        maximumFileSizeToCacheInBytes: 250 * 1024,
        globIgnores: ["**/holidays*.json", "**/lunar-*.js"],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.destination === "script" ||
              request.destination === "style" ||
              url.pathname.startsWith("/assets/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "app-assets"
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".ics"),
            handler: "NetworkFirst",
            options: {
              cacheName: "calendar-files"
            }
          }
        ]
      },
      manifest: {
        name: "极客日历实验室",
        short_name: "GeekCalendarLab",
        description: "Holiday and workday-aware calendar subscription and web app.",
        theme_color: "#153b2e",
        background_color: "#f6f3ea",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
