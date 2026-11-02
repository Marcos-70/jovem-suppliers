// Build de FICHEIRO ÚNICO para publicação como página hospedada (modo DEMONSTRAÇÃO).
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

const fonts: Plugin = {
  name: 'google-fonts', transformIndexHtml: () => [
    { tag: 'link', attrs: { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@100..900&display=swap' }, injectTo: 'head' },
  ],
}
export default defineConfig({
  plugins: [react(), viteSingleFile(), fonts],
  define: { 'import.meta.env.VITE_ROUTER': '"memory"', 'import.meta.env.VITE_FORCE_DEMO': '"true"' },
  resolve: { alias: [
    { find: /^@fontsource(-variable)?\/.*/, replacement: path.resolve(__dirname, 'src/empty.css') },
    { find: '@', replacement: path.resolve(__dirname, 'src') },
  ] },
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false, chunkSizeWarningLimit: 5000 },
})
