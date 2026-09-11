/** Build target for the `<materialkai-product>` embed bundle (#321 M1 bullet 3, #258). */
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    // One three.js instance, same reason as the app config.
    dedupe: ['three'],
  },
  // This build has no static assets of its own, and leaving publicDir at its default makes Vite
  // treat `public/` as an asset source while we are writing INTO `public/embed` — it warns that
  // the two are not separate folders, and in principle could copy the tree into itself.
  publicDir: false,
  build: {
    outDir: 'public/embed',
    // The directory is shared with nothing, but emptying it would also delete anything a future
    // second embed entry writes there.
    emptyOutDir: false,
    // Merchant pages are not all HTTPS/modern; this is the widest target that still lets three.js
    // ship without transpile damage.
    target: 'es2020',
    lib: {
      entry: path.resolve(__dirname, 'src/embed/materialkai-product.ts'),
      name: 'MaterialKaiEmbed',
      formats: ['iife'],
      fileName: () => 'materialkai-product.js',
    },
    // three.js is BUNDLED, not external. There is no CDN import map on a merchant's page and no
    // guarantee they have three at all — a self-contained file is the entire point.
    rollupOptions: {},
    // NO source map. This file is served from `public/embed` on every deployment, so a 3.15 MB
    // map is 12% of the whole build output multiplied by every deployment Vercel retains — and
    // it publishes the bundled source, ours and three.js's, to any merchant page that loads it.
    sourcemap: false,
    // three + GLTFLoader is legitimately ~500 kB raw. Warning on it every build trains people to
    // ignore build warnings, which is worse than the size.
    chunkSizeWarningLimit: 1200,
  },
});
