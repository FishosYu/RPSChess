import { i18nPlugin } from './packages/i18n/source/vite'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  plugins: [
    {
      name: 'html-inject-pkg-name',
      transformIndexHtml: (html: string) => html.replace(/<title>[^<]*<\/title>/, `<title>${pkg.name}</title>`),
    },
    i18nPlugin({ localeDir: resolve(__dirname, 'i18n') }),
  ],
  define: {
    'import.meta.env.VITE_I18N_MODE': JSON.stringify(process.env.VITE_I18N_MODE ?? 'dev'),
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@minigame/core': resolve(__dirname, 'game/core/source/index.ts'),
      '@minigame/i18n/vite': resolve(__dirname, 'packages/i18n/source/vite.ts'),
      '@minigame/i18n': resolve(__dirname, 'packages/i18n/source/index.ts'),
      '@minigame/platform': resolve(__dirname, 'packages/platform/source/index.ts'),
      '@minigame/render-adapter/pixi': resolve(__dirname, 'packages/render-adapter/source/pixi.ts'),
      '@minigame/render-adapter': resolve(__dirname, 'packages/render-adapter/source/index.ts'),
    },
  },
  server: {
    host: true,
    port: 15173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'ES2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          platform: ['@minigame/platform', '@minigame/render-adapter/pixi'],
          'game-logic': ['@minigame/core', '@minigame/i18n'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
