import { defineConfig } from "vite";

// FieldNotes AI is a plain Vite + vanilla JS app.
// The build output in dist/ can be deployed to any static host
// (Firebase Hosting, GitHub Pages, Netlify, ...).
export default defineConfig({
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});
