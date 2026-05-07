import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

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
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
        'img-src': ['self', 'data:', 'https:'],
        'font-src': ['self', 'https://fonts.gstatic.com'],
        'connect-src': ['self', 'https://discord.com'],
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
