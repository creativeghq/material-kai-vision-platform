import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: 8080,
      host: true
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY),
      'process.env.MIVAA_GATEWAY_URL': JSON.stringify(env.MIVAA_GATEWAY_URL),
      'process.env.MIVAA_API_KEY': JSON.stringify(env.MIVAA_API_KEY),
    }
  }
})
