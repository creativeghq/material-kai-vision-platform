import path from 'path';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
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
          // Function-based manualChunks checks the resolved file path, ensuring
          // @sparkjsdev/spark is co-located with three in the same chunk.
          // The array syntax was insufficient — spark.module.js ended up in its
          // own separate chunk, getting a tree-shaken THREE namespace that was
          // missing Vector2, ShaderMaterial, etc. → "(void 0) is not a constructor"
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            // 3D rendering — three + spark MUST be in the same chunk so spark's
            // `import * as THREE from "three"` resolves against the full, un-shaken THREE
            if (
              id.includes('/three/') ||
              id.includes('/@react-three/') ||
              id.includes('/@sparkjsdev/')
            ) return 'vendor-3d';
            // Core framework
            if (id.includes('/react-dom/') || id.includes('/react-router') || (id.includes('/react/') && !id.includes('/react-query'))) return 'vendor-react';
            // UI primitives
            if (id.includes('/lucide-react/') || id.includes('/@radix-ui/')) return 'vendor-ui';
            // Charts
            if (id.includes('/recharts/') || id.includes('/victory-')) return 'vendor-charts';
            // Supabase
            if (id.includes('/@supabase/')) return 'vendor-supabase';
            // Sentry
            if (id.includes('/@sentry/')) return 'vendor-sentry';
            // Data layer
            if (id.includes('/@tanstack/')) return 'vendor-query';
            // Flow builder
            if (id.includes('/@xyflow/')) return 'vendor-xyflow';
            // Utility libraries
            if (
              id.includes('/date-fns/') ||
              id.includes('/clsx/') ||
              id.includes('/tailwind-merge/') ||
              id.includes('/zod/') ||
              id.includes('/zustand/') ||
              id.includes('/immer/')
            ) return 'vendor-utils';
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
