import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    watch: {
      // Ignore the check-mode generated dir so a parallel `bun run check`
      // never triggers HMR / hydration mismatches in the running dev server.
      ignored: ['**/.svelte-kit-check/**'],
    },
  },
});
