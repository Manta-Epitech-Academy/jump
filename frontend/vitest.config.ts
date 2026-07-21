import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

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
