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
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      // Supabase environment variables (as set in Vercel)
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
      // MIVAA environment variables
      'process.env.MIVAA_GATEWAY_URL': JSON.stringify(env.MIVAA_GATEWAY_URL),
      'process.env.MIVAA_API_KEY': JSON.stringify(env.MIVAA_API_KEY),
      // AI API Keys
      'process.env.VITE_OPENAI_API_KEY': JSON.stringify(env.VITE_OPENAI_API_KEY),
      'process.env.OPENAI_API_KEY': JSON.stringify(env.VITE_OPENAI_API_KEY),
      'process.env.HUGGINGFACE_API_TOKEN': JSON.stringify(env.HUGGINGFACE_API_TOKEN),
      'process.env.REPLICATE_API_TOKEN': JSON.stringify(env.REPLICATE_API_TOKEN),
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
