import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// The app's own Vite config, `sveltekit()` and its options included, so a test
// run compiles exactly what the build compiles. `vite.config.ts` also gives
// vitest its own generated directory (`.svelte-kit-test`), off the dev server's.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Inline projects inherit this root config, plugins included (vitest 5's
      // `extends: true` default), and inherited arrays are appended to. So the
      // plugin is declared once, in vite.config.ts: repeating it in a project would run a
      // second `sveltekit()`, and its `sync.all()`, for that project.
      projects: [
        {
          test: {
            name: 'unit',
            include: ['src/**/*.test.ts'],
            exclude: ['src/**/__integration__/**'],
          },
        },
        {
          test: {
            name: 'integration',
            include: ['src/**/__integration__/**/*.integration.test.ts'],
            // Sized for the three suites that drive a real Chrome, not for the
            // ~188 that only talk to Postgres and return in single-digit
            // milliseconds. The expensive one is
            // `config_diploma_template_preview`: it rasterises a full certificate
            // page to PNG with the font bytes inlined, which is far more work than
            // the PDF path's `printToPDF` (vector, no rasterisation). It takes
            // ~300ms here and blew a 15s budget on a 2-vCPU CI runner, which is
            // the gap this value exists to cover - the old 15s was picked when the
            // suite only ever ran on a dev laptop.
            //
            // The trade is stated rather than hidden: a genuinely hung test now
            // takes a minute to report instead of fifteen seconds. Worth it
            // against a browser test that flakes by the load on the runner.
            testTimeout: 60_000,
            // Fixtures do real work too (a `beforeAll` seeding a cohort), and a
            // hook timeout reports as a whole file skipped rather than as a
            // failing assertion, which is the least diagnosable outcome there is.
            hookTimeout: 60_000,
            // One file at a time. Every suite cleans up by id, so they do not
            // delete each other's rows, but they do share one Postgres and
            // several of them read an aggregate over a scope wider than their own
            // fixture. Two suites also stamp their fixture names with
            // `Date.now()`, which collides when they start in the same
            // millisecond. A flaky suite is worse than no suite (TESTING.md §1),
            // and the wall-clock cost of serialising ~20 files is a minute.
            fileParallelism: false,
          },
        },
      ],
    },
  }),
);
