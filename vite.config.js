import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  // The Base44 development hooks can block Vite before it opens a local port
  // when no Base44 proxy is configured. Production builds still include the
  // plugin; local serve mode can opt in explicitly when those hooks are needed.
  const enableBase44Plugin = command === 'build' || process.env.BASE44_DEV_PLUGIN === 'true';
  const configuredPlugins = [react()];
  if (enableBase44Plugin) {
    const { default: base44 } = await import('@base44/vite-plugin');
    configuredPlugins.unshift(base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }));
  }

  return {
    server: {
      allowedHosts: true,
    },
    logLevel: 'error', // Suppress warnings, only show errors
    plugins: configuredPlugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // Code splitting — split vendor libraries into separate chunks
      rollupOptions: {
        output: {
          // Content-hash filenames ensure browsers always fetch the latest bundle
          // after a deploy — eliminates stale JS chunk serving
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks: {
            // Core React runtime
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // Data fetching
            'vendor-query': ['@tanstack/react-query'],
            // Supabase
            'vendor-supabase': ['@supabase/supabase-js'],
            // Charts
            'vendor-charts': ['recharts'],
            // Date utilities
            'vendor-date': ['date-fns'],
            // PDF generation
            'vendor-pdf': ['jspdf', 'html2canvas'],
            // UI primitives (Radix)
            'vendor-radix': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-label',
              '@radix-ui/react-switch',
              '@radix-ui/react-tooltip',
              '@radix-ui/react-popover',
              '@radix-ui/react-progress',
              '@radix-ui/react-separator',
              '@radix-ui/react-slider',
              '@radix-ui/react-toast',
              '@radix-ui/react-toggle',
            ],
          },
        },
      },
      // Increase chunk size warning limit slightly (we have many components)
      chunkSizeWarningLimit: 600,
      // No source maps in production — reduces bundle size
      sourcemap: false,
      // Minify with esbuild (faster than terser)
      minify: 'esbuild',
      // Target modern browsers for smaller bundles
      target: 'es2020',
    },
  };
});
