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
    // modern browsers IGNORE `'unsafe-inline'`.
    //
    // The thing that needed `'unsafe-inline'` to be effective was the Umami
    // session recorder, and it is gone (issue #275). Switching to `kit.csp` is
    // now possible and wanted; it is held back only because it has to be
    // re-verified against Crisp and every route first.
    adapter: adapter(),
    // Stale-client recovery after a prod deploy. Each build stamps a version
    // into `_app/version.json`; the client polls it every 60s. When it changes
    // (a new deploy shipped) the `updated` store flips, and the root layout
    // forces a full page reload on the next navigation (see +layout.svelte).
    // Without this, a client holding old HTML keeps requesting old hashed
    // chunks the new image no longer serves -> 404 + "Failed to fetch
    // dynamically imported module".
    version: {
      pollInterval: 60_000,
    },
  },
};

export default config;
