import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const UMAMI_HOST = 'https://jump-umami.epiboost.eu';

const jumpGamesOrigin = process.env.JUMP_GAMES_URL
  ? new URL(process.env.JUMP_GAMES_URL).origin
  : null;

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
        'script-src': [
          'self',
          UMAMI_HOST,
          'sha256-Stkt8ip/11kybd4lt+wxSqAzIicXuhKo5w+vKPzFxdE=',
        ],
        'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
        'img-src': ['self', 'data:', 'https:'],
        'font-src': ['self', 'https://fonts.gstatic.com'],
        // Umami beacons go to UMAMI_HOST; Discord OAuth pings discord.com.
        'connect-src': ['self', 'https://discord.com', UMAMI_HOST],
        'frame-ancestors': ['none'],
        // Allow embedding the jump-games iframe (mini-jeux). Origin comes from
        // JUMP_GAMES_URL at build time; falls back to self-only when unset.
        'frame-src': jumpGamesOrigin ? ['self', jumpGamesOrigin] : ['self'],
      },
    },
    adapter: adapter(),
  },
};

export default config;
