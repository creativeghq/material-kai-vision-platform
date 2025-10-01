import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig(() => ({
  plugins: [react()],
  server: {
    port: 8080,
    host: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Force React to use production builds to avoid NODE_ENV checks
      'react': path.resolve(__dirname, './node_modules/react/cjs/react.production.min.js'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom/cjs/react-dom.production.min.js'),
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/cjs/react-jsx-runtime.production.min.js')
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom']
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': {}
  }
}))
