import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    alias: {
      $lib: 'src/lib',
    },
    // Let `bun run check` write its generated artefacts to a separate
    // directory so it doesn't race with the dev server over `.svelte-kit/`.
    // See `tsconfig.check.json` and the `check` script in package.json.
    outDir: process.env.KIT_OUTDIR || '.svelte-kit',
    // CSP is set manually in `hooks.server.ts` (`setSecurityHeaders`).
    // We can't use `kit.csp` here: it auto-injects a per-request nonce into
    // `script-src`, and once a nonce or hash is present in `script-src`,
    // modern browsers IGNORE `'unsafe-inline'`. The Umami session-replay
    // recorder injects ad-hoc inline scripts and `on*` attribute handlers
    // that we can't pre-hash, so we need `'unsafe-inline'` to be effective.
    adapter: adapter(),
  },
};

export default config;
