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

            // Extract "pkg" or "@scope/pkg" from the resolved path
            const m = id.match(/node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/);
            if (!m) return undefined;
            const pkg = m[1].replace(/\\/g, '/'); // normalise Windows separators

            // Chunk assignments — mirrors the old array-based config exactly,
            // with @sparkjsdev/spark added to vendor-3d.
            const CHUNK: Record<string, string> = {
              // 3D (three + spark must be co-bundled so spark's `import * as THREE`
              // resolves the full, un-tree-shaken namespace)
              'three': 'vendor-3d',
              '@react-three/fiber': 'vendor-3d',
              '@react-three/drei': 'vendor-3d',
              '@sparkjsdev/spark': 'vendor-3d',
              // Core framework
              'react': 'vendor-react',
              'react-dom': 'vendor-react',
              'react-router-dom': 'vendor-react',
              // UI primitives
              'lucide-react': 'vendor-ui',
              '@radix-ui/react-dialog': 'vendor-ui',
              '@radix-ui/react-dropdown-menu': 'vendor-ui',
              '@radix-ui/react-tooltip': 'vendor-ui',
              '@radix-ui/react-popover': 'vendor-ui',
              '@radix-ui/react-tabs': 'vendor-ui',
              '@radix-ui/react-select': 'vendor-ui',
              // Charts — co-bundle with react to guarantee forwardRef is initialized before recharts reads it
              'recharts': 'vendor-react',
              // Supabase
              '@supabase/supabase-js': 'vendor-supabase',
              // Sentry — depends on React, co-bundle to avoid forwardRef init order issues
              '@sentry/react': 'vendor-react',
              // Data layer
              '@tanstack/react-query': 'vendor-query',
              '@tanstack/query-core': 'vendor-query',
              // Flow builder — depends on React, co-bundle
              '@xyflow/react': 'vendor-react',
              // Utility libraries
              'date-fns': 'vendor-utils',
              'clsx': 'vendor-utils',
              'tailwind-merge': 'vendor-utils',
              'zod': 'vendor-utils',
              'zustand': 'vendor-utils',
              'immer': 'vendor-utils',
            };

            return CHUNK[pkg] ?? undefined;
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
