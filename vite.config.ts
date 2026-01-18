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
          manualChunks: {
            // Vendor libraries
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
            'vendor-3d': ['three', '@react-three/fiber', '@react-three/drei'],
            'vendor-ml': ['onnxruntime-web', 'onnxruntime-common'],
            'vendor-utils': ['date-fns', 'clsx', 'tailwind-merge'],
          },
        },
      },
      chunkSizeWarningLimit: 1000, // Increase warning limit to 1MB
    },
  };
});
