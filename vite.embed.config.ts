/**
 * Build target for the `<materialkai-product>` embed bundle (#321 M1 bullet 3, #258).
 *
 * Separate from `vite.config.ts` on purpose. The app build is a React SPA with code-splitting and
 * a dozen `define`d env values; this is one self-contained IIFE that a merchant drops into their
 * own `<script src>`. Sharing a config would mean the embed inherits React, the Supabase client
 * and every env substitution the app needs — none of which belong on a stranger's product page.
 *
 * Output goes to `public/embed/`, so `vite build` copies it into `dist/` and it is served from the
 * app's own origin at `/embed/materialkai-product.js`. The artifact is gitignored and rebuilt by
 * `npm run build` — a committed build output is a merge conflict waiting to happen and drifts from
 * its source the first time someone forgets.
 *
 * IIFE, not ESM: the tag is `<script src=… defer>` on pages that may be anything from a hand-written
 * HTML file to a Shopify theme. `type="module"` would be one more thing for the merchant to get
 * right, for no benefit to us.
 */
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
    sourcemap: true,
    // three + GLTFLoader is legitimately ~500 kB raw. Warning on it every build trains people to
    // ignore build warnings, which is worse than the size.
    chunkSizeWarningLimit: 1200,
  },
});
