import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		projects: [
			{
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/__integration__/**']
				}
			},
			{
				test: {
					name: 'integration',
					include: ['src/**/__integration__/**/*.integration.test.ts'],
					testTimeout: 15_000
				}
			}
		]
	}
});
