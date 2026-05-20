import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const UMAMI_HOST = 'https://jump-umami.epiboost.eu';

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
    csp: {
      directives: {
        'default-src': ['self'],
        // Umami analytics ships its tracker script from UMAMI_HOST; the
        // sha256 hash whitelists mode-watcher's inline theme bootstrap
        // script (used to avoid a flash of the wrong theme on load).
        // `unsafe-hashes` + `unsafe-inline` are required because the Umami
        // session-replay recorder instruments DOM nodes with inline `on*`
        // attribute handlers, which neither nonces nor plain hashes cover.
        'script-src': [
          'self',
          UMAMI_HOST,
          'sha256-Stkt8ip/11kybd4lt+wxSqAzIicXuhKo5w+vKPzFxdE=',
          'unsafe-hashes',
          'unsafe-inline',
        ],
        'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
        'img-src': ['self', 'data:', 'https:'],
        'font-src': ['self', 'https://fonts.gstatic.com'],
        // Umami beacons go to UMAMI_HOST; Discord OAuth pings discord.com.
        'connect-src': ['self', 'https://discord.com', UMAMI_HOST],
        'frame-ancestors': ['none'],
        // Allow embedding the jump-games iframe (mini-jeux) from any epiboost
        // subdomain so per-env URLs (dev/staging/prod) work without rebuilds.
        'frame-src': ['self', 'https://*.epiboost.eu', 'https://*.epiboost.fr'],
      },
    },
    adapter: adapter(),
  },
};

export default config;
