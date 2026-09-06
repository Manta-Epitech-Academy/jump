import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    watch: {
      // The generated dirs the other commands own, so a parallel `bun run
      // check` or `bun run test` never triggers HMR / hydration mismatches in
      // the running dev server. `.svelte-kit/` itself stays watched: it is this
      // server's own, and SvelteKit regenerates it as routes change.
      ignored: [
        '**/.svelte-kit-check/**',
        '**/.svelte-kit-test/**',
        '**/.svelte-kit-e2e/**',
      ],
    },
  },
});
