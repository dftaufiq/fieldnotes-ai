import { defineConfig } from "vite";

// FieldNotes AI is a plain Vite + vanilla JS app.
// The build output in dist/ can be deployed to any static host
// (Firebase Hosting, GitHub Pages, Netlify, ...).
//
// Default build (`npm run build`) assumes the app is served from the domain
// root ("/"). The GitHub Pages build (`npm run build:pages`, mode "pages")
// sets base to "/fieldnotes-ai/" because the site is served from the
// project subpath https://dftaufiq.github.io/fieldnotes-ai/.
export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/fieldnotes-ai/" : "/",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
}));
