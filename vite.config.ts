import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // This is the public GitHub Pages path for this repository.
  base: "/campusface-attendance/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.png", "pwa-512.png"],
      manifest: {
        id: "./",
        name: "CampusFace Attendance",
        short_name: "CampusFace",
        description: "A lecturer-only campus attendance workspace.",
        theme_color: "#102336",
        background_color: "#f4f7fa",
        display: "standalone",
        display_override: ["standalone", "minimal-ui", "browser"],
        prefer_related_applications: false,
        orientation: "portrait",
        scope: "./",
        start_url: "./",
        icons: [
          {
            src: "./pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "./pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"]
      }
    })
  ]
});
