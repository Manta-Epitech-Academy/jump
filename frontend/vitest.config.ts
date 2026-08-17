import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

// `.svelte-kit/` belongs to the dev server and to nothing else. `sveltekit()`
// runs `sync.all()` when it is called, so a test run regenerates that
// directory under a server that is live in another terminal, including
// `generated/root.svelte` and `generated/client/app.js`: the page renders from
// SSR, then hydration lands on modules that moved under it, and it goes white
// until the server is restarted. `svelte.config.js` reads `KIT_OUTDIR`, the
// same lever `bun run check` pulls.
//
// Set here rather than in the `test` scripts because the invariant is vitest's,
// not one way of launching it: an editor's test runner or a bare `bunx vitest`
// has to obey it too. `??=` leaves CI free to override.
process.env.KIT_OUTDIR ??= '.svelte-kit-test';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    projects: [
      {
        plugins: [sveltekit()],
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/__integration__/**'],
        },
      },
      {
        plugins: [sveltekit()],
        test: {
          name: 'integration',
          include: ['src/**/__integration__/**/*.integration.test.ts'],
          testTimeout: 15_000,
        },
      },
    ],
  },
});
