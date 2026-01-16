<script lang="ts">
	import '@fontsource/anton';
	import '@fontsource-variable/ibm-plex-sans';
	import './layout.css';
	import { Toaster } from '$lib/components/ui/sonner';
	import { onNavigate } from '$app/navigation';
	import { ModeWatcher } from 'mode-watcher';

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
</script>

<svelte:head>
	<title>CodeCamp Manager</title>
</svelte:head>

<ModeWatcher />

<div style="display: contents">
	<Toaster richColors position="top-center" />
	{@render children()}
</div>
