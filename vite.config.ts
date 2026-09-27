import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://xcraft14.github.io/albion-market-calculator/
  base: '/albion-market-calculator/',
  plugins: [svelte()],
  build: {
    // The crafting game data (~1.6 MB, ~100 kB gzipped) is its own chunk, loaded only on the Crafting page.
    chunkSizeWarningLimit: 2000,
  },
})
