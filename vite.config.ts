import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs work both on the GitHub Pages subpath and inside the Android APK.
  base: "./",
  plugins: [react()]
});
