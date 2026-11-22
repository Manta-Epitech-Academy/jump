import { execFileSync } from 'node:child_process';
import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Hosts a script is actually allowed to load from. Literal constants, not env
// vars: which third parties we talk to doesn't vary by environment, only
// whether their website ID is set does (see Umami.svelte / Crisp.svelte).
// Duplicated (not imported) from hooks.server.ts's copy: this file runs as
// plain Node when Vite loads its config, before any SvelteKit env module exists
// to import from, mirroring how the same hosts are already duplicated as
// literals between hooks.server.ts and the two components.
const UMAMI_HOST = 'https://jump-umami.epiboost.eu';
const CRISP_HOST = 'https://client.crisp.chat';
const CRISP_RELAY = 'wss://client.relay.crisp.chat';

// The commit this build is made from. CI passes `GIT_SHA`, because the image
// is built from `frontend/` alone and carries no `.git`; a local build reads
// HEAD. `undefined` when neither exists, which leaves kit its default.
function revision() {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

// `.svelte-kit/` belongs to the dev server and to nothing else. `sveltekit()`
// runs `sync.all()` when it is called, so any other command that loads this
// config regenerates that directory under a server that is live in another
// terminal, including `generated/root.svelte` and `generated/client/app.js`:
// the page renders from SSR, then hydration lands on modules that moved under
// it, and it goes white until the server is restarted. So every such command
// gets its own directory: `bun run check` and the E2E build pass `KIT_OUTDIR`,
// and vitest gets its own without being told. Vitest is recognised by the
// `test` mode it loads every config in, not by the `VITEST` variable: its CLI
// sets that variable before loading this file, but `createVitest()`, which an
// editor's test runner calls, does not. So a bare `bunx vitest` and an editor
// both obey it. An explicit `KIT_OUTDIR` still wins, which leaves CI free to
// override. Each directory is listed in `server.watch.ignored` below.
function kitOutDir(mode: string): string {
  return (
    process.env.KIT_OUTDIR ??
    (mode === 'test' ? '.svelte-kit-test' : '.svelte-kit')
  );
}

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    sveltekit({
      // Consult https://svelte.dev/docs/kit/integrations
      // for more information about preprocessors
      preprocess: vitePreprocess(),
      outDir: kitOutDir(mode),
      adapter: adapter(),
      // `resolve()` returns a root-relative path, never one relative to the page
      // being served. By default it answers `../../x` during a request, which is
      // fine as an `href` but turns `${ORIGIN}${resolve(...)}` (a mailed login
      // link, a projected QR code, an admin API answer) into a broken URL. Jump is
      // served from the root, so a root-relative path names the same page.
      paths: { relative: false },
      // The Umami session recorder needed `'unsafe-inline'`/`'unsafe-hashes'` in
      // `script-src` to evaluate the ad-hoc inline scripts and `on*` handlers it
      // injected for replay. It's gone (issue #275), and everything left loads
      // from an explicit host ('self' for our own bundle, UMAMI_HOST/CRISP_HOST
      // for the two third-party scripts) rather than from inline text, so
      // `csp` can own the policy and hand out a real per-request nonce instead.
      // `frame-src` is the one directive NOT declared here: its
      // `JUMP_GAMES_URL`-derived entry is a genuine per-deployment value, and
      // this file only ever runs at build time (see the Dockerfile: the image is
      // built once, before any environment's env vars exist, then deployed
      // everywhere with different ones). Anything read from `process.env` here
      // would freeze to whatever the CI build happened to have. So `frame-src`
      // stays computed at request time in hooks.server.ts, appended onto the
      // header `csp` sets here. `form-action` is absent for the same reason and
      // a stronger one: the hosts it has to name are the curated
      // `Workshop_Instance` rows, which are data rather than configuration.
      //
      // Both have to be absent rather than merely widened here. A header repeating
      // a directive keeps the FIRST occurrence and ignores the rest, so a
      // `form-action` left in this list would silently win over the computed one.
      csp: {
        mode: 'auto',
        directives: {
          'default-src': ['self'],
          'script-src': ['self', UMAMI_HOST, CRISP_HOST],
          // Svelte transitions set `element.style` directly at runtime; there's
          // no nonce for a runtime property assignment, so this needs
          // `'unsafe-inline'` regardless of `csp` (see the SvelteKit CSP docs).
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
        },
      },
      // Stale-client recovery after a prod deploy. Each build stamps a version
      // into `_app/version.json`; the client polls it every 60s. When it changes
      // (a new deploy shipped) `updated.current` flips, and the root layout
      // forces a full page reload on the next navigation (see +layout.svelte).
      // Without this, a client holding old HTML keeps requesting old hashed
      // chunks the new image no longer serves -> 404 + "Failed to fetch
      // dynamically imported module". SvelteKit 3 also checks on data responses
      // and when the tab regains focus, and polls hourly by default; the 60s
      // interval stays explicit so a tab left open is told within a minute.
      //
      // The version is the commit the build was made from, so the same value
      // also tells a person which code an environment runs (AppRevision.svelte,
      // and `_app/version.json` for anyone without a session). Unlike the CSP
      // values above, this is meant to freeze at build time: it describes the
      // build, not the environment. Without a commit (a local Docker build has
      // no `.git`) kit falls back to its timestamp, which still changes on
      // every build and which AppRevision does not display.
      version: {
        name: revision(),
        pollInterval: 60_000,
      },
    }),
  ],
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
}));
