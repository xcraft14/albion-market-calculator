import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://xcraft14.github.io/albion-market-calculator/
  base: '/albion-market-calculator/',
  plugins: [svelte()],
})
