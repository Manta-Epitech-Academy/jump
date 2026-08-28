import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Hosts a script is actually allowed to load from. Literal constants, not env
// vars: which third parties we talk to doesn't vary by environment, only
// whether their website ID is set does (see Umami.svelte / Crisp.svelte).
// Duplicated (not imported) from hooks.server.ts's copy: this file runs as
// plain Node at kit startup, before any SvelteKit env module exists to import
// from, mirroring how the same hosts are already duplicated as literals
// between hooks.server.ts and the two components.
const UMAMI_HOST = 'https://jump-umami.epiboost.eu';
const CRISP_HOST = 'https://client.crisp.chat';
const CRISP_RELAY = 'wss://client.relay.crisp.chat';

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
    adapter: adapter(),
    // The Umami session recorder needed `'unsafe-inline'`/`'unsafe-hashes'` in
    // `script-src` to evaluate the ad-hoc inline scripts and `on*` handlers it
    // injected for replay. It's gone (issue #275), and everything left loads
    // from an explicit host ('self' for our own bundle, UMAMI_HOST/CRISP_HOST
    // for the two third-party scripts) rather than from inline text, so
    // `kit.csp` can own the policy and hand out a real per-request nonce
    // instead. `frame-src` is the one directive NOT declared here: its
    // `JUMP_GAMES_URL`-derived entry is a genuine per-deployment value, and
    // this file only ever runs at build time (see the Dockerfile: the image is
    // built once, before any environment's env vars exist, then deployed
    // everywhere with different ones) — anything read from `process.env` here
    // would freeze to whatever the CI build happened to have. So `frame-src`
    // stays computed at request time in hooks.server.ts, appended onto the
    // header kit.csp sets here.
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self', UMAMI_HOST, CRISP_HOST],
        // Svelte transitions set `element.style` directly at runtime; there's
        // no nonce for a runtime property assignment, so this needs
        // `'unsafe-inline'` regardless of kit.csp (see the SvelteKit CSP docs).
        'style-src': [
          'self',
          'unsafe-inline',
          'https://fonts.googleapis.com',
          CRISP_HOST,
        ],
        'img-src': ['self', 'data:', 'https:'],
        'font-src': ['self', 'https://fonts.gstatic.com', CRISP_HOST],
        'connect-src': ['self', UMAMI_HOST, CRISP_HOST, CRISP_RELAY],
        'frame-ancestors': ['none'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
      },
    },
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
