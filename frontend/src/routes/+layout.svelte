<script lang="ts">
	import '@fontsource/anton';
	import '@fontsource-variable/ibm-plex-sans';
	import './layout.css';
	import { Toaster } from '$lib/components/ui/sonner';
	import { onNavigate } from '$app/navigation';
	import { ModeWatcher } from 'mode-watcher';
	import { page } from '$app/state';
	import { dev } from '$app/environment';

	// Import SVGs as URLs using Vite's ?url suffix
	import faviconProd from '$lib/assets/favicon.svg?url';
	import faviconDev from '$lib/assets/favicon-dev.svg?url';

	let { children } = $props();

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// Access expanded user campus from page data (via layout.server.ts -> hooks)
	let userCampusName = $derived(page.data.user?.expand?.campus?.name);
</script>

<svelte:head>
	<title>TekCamp {userCampusName ? `| ${userCampusName}` : ''}</title>
	<link rel="icon" href={dev ? faviconDev : faviconProd} />
</svelte:head>

<ModeWatcher />

<div style="display: contents">
	<Toaster richColors position="top-center" />
	{@render children()}
</div>
