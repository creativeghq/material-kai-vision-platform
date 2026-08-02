import path from 'path';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    optimizeDeps: {
      // Excluding @sparkjsdev/spark from pre-bundling fixes the "(void 0) is not a constructor"
      // error in dev mode. When Vite pre-bundles spark with esbuild, it externalises `three`
      // but creates EMPTY imports (import {} from "chunk-three.js") for the `import * as THREE`
      // namespace — so all THREE.* constructors are undefined inside the pre-bundle.
      // Excluding makes Vite serve spark.module.js as raw ESM and rewrite its bare "three"
      // specifier to the proper pre-bundled three URL, giving spark the full THREE namespace.
      exclude: ['@sparkjsdev/spark'],
      // grapesjs-preset-newsletter is a UMD bundle — must be pre-bundled by Vite/esbuild
      // so it is available as a proper ESM module in the dev server.
      include: ['grapesjs', 'grapesjs-preset-newsletter'],
    },
    server: {
      port: 8080,
      host: true,
      proxy: {
        '/api': {
          target: env.MIVAA_GATEWAY_URL || 'https://v1api.materialshub.gr',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      // Ensure only one instance of three.js is used across all modules
      // (prevents @sparkjsdev/spark from getting a separate THREE instance)
      dedupe: ['three'],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      // Supabase environment variables (supports both NEXT_PUBLIC_ prefix from Vercel and direct naming)
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      // MIVAA environment variables
      'process.env.MIVAA_GATEWAY_URL': JSON.stringify(env.MIVAA_GATEWAY_URL),
      'process.env.MIVAA_API_KEY': JSON.stringify(env.MIVAA_API_KEY),
      'import.meta.env.VITE_MIVAA_API_URL': JSON.stringify(env.VITE_MIVAA_API_URL || env.MIVAA_GATEWAY_URL),
      'import.meta.env.VITE_MIVAA_SERVICE_URL': JSON.stringify(env.VITE_MIVAA_SERVICE_URL || env.MIVAA_GATEWAY_URL || 'https://v1api.materialshub.gr'),
      // WebSocket URL for real-time updates (supports legacy NEXT_PUBLIC_ prefix)
      'process.env.NEXT_PUBLIC_WS_URL': JSON.stringify(env.VITE_WS_URL || env.NEXT_PUBLIC_WS_URL || ''),
      'import.meta.env.VITE_WS_URL': JSON.stringify(env.VITE_WS_URL || env.NEXT_PUBLIC_WS_URL || ''),
      // SECURITY: AI API Keys are NOT exposed to client-side code
      // They should only be used server-side (Supabase Edge Functions, MIVAA API)
      // Client code should call backend APIs which then use these keys securely
    },
    build: {
      rollupOptions: {
        output: {
          // Extract the exact package name from the resolved module path (handles
          // both scoped @org/pkg and plain pkg, and both / and \ path separators).
          // This is equivalent to the array-based manualChunks but also correctly
          // assigns @sparkjsdev/spark into vendor-3d (which the array syntax failed
          // to do, causing spark to get a tree-shaken THREE with missing exports).
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;

            // Extract "pkg" or "@scope/pkg" from the resolved path.
            //
            // Split on the LAST `node_modules/`, not the first. Nested package stores put a second
            // one in the path — Deno vendors as
            //   .../node_modules/.deno/react@18.3.1/node_modules/react/index.js
            // and pnpm as  .../node_modules/.pnpm/.../node_modules/react/... — so matching the
            // FIRST segment yields `.deno` (or `.pnpm`) for every package, CHUNK[pkg] is undefined
            // for all of them, and manualChunks silently assigns nothing.
            //
            // That failure is invisible: the build still succeeds and emits a working bundle, just
            // with a completely different chunk shape from CI. It is what produced the retracted
            // "every visitor downloads 1.37 MB of three.js" claim in audit #308 — a conclusion
            // drawn from a local artifact that is not the one we ship. Taking the last segment is
            // correct for a flat tree too, so this is strictly more robust, not a special case.
            const norm = id.replace(/\\/g, '/'); // normalise Windows separators
            const tail = norm.split('node_modules/').pop();
            const m = tail?.match(/^(@[^/]+\/[^/]+|[^/]+)/);
            if (!m) return undefined;
            const pkg = m[1];

            // Chunk assignments — mirrors the old array-based config exactly,
            // with @sparkjsdev/spark added to vendor-3d.
            const CHUNK: Record<string, string> = {
              // 3D (three + spark must be co-bundled so spark's `import * as THREE`
              // resolves the full, un-tree-shaken namespace)
              'three': 'vendor-3d',
              '@react-three/fiber': 'vendor-3d',
              '@react-three/drei': 'vendor-3d',
              '@sparkjsdev/spark': 'vendor-3d',
              // Core framework only — keep this chunk small
              'react': 'vendor-react',
              'react-dom': 'vendor-react',
              'react-router-dom': 'vendor-react',
              'react-is': 'vendor-react',
              // UI primitives (individual @radix-ui/* caught by prefix match below)
              'lucide-react': 'vendor-ui',
              'embla-carousel-react': 'vendor-ui',
              'cmdk': 'vendor-ui',
              'vaul': 'vendor-ui',
              'input-otp': 'vendor-ui',
              // Charts — recharts v3 uses function components (no forwardRef),
              // safe in its own chunk; Rollup import ordering guarantees React loads first
              'recharts': 'vendor-charts',
              // Supabase
              '@supabase/supabase-js': 'vendor-supabase',
              // Sentry
              '@sentry/react': 'vendor-sentry',
              // Data layer
              '@tanstack/react-query': 'vendor-query',
              '@tanstack/query-core': 'vendor-query',
              // Flow builder — Rollup import ordering guarantees React loads first
              '@xyflow/react': 'vendor-flow',
              '@xyflow/system': 'vendor-flow',
              // Email template builder (lazy-loaded page, ~1.1 MB)
              'grapesjs': 'vendor-grapesjs',
              'grapesjs-preset-newsletter': 'vendor-grapesjs',
              // PDF generation (dynamically imported on button click)
              'jspdf': 'vendor-pdf',
              'html2canvas': 'vendor-pdf',
              // Utility libraries
              'date-fns': 'vendor-utils',
              'clsx': 'vendor-utils',
              'tailwind-merge': 'vendor-utils',
              'zod': 'vendor-utils',
              'zustand': 'vendor-utils',
              'immer': 'vendor-utils',
            };

            // Prefix-match all @radix-ui/* packages into vendor-ui
            if (pkg.startsWith('@radix-ui/')) return 'vendor-ui';

            return CHUNK[pkg] ?? undefined;
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
