<script lang="ts">
	import '@fontsource/anton';
	import '@fontsource-variable/ibm-plex-sans';
	import './layout.css';
	import { Toaster } from '$lib/components/ui/sonner';
	import { onNavigate } from '$app/navigation';
	import { ModeWatcher } from 'mode-watcher';
	import { page } from '$app/state';

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
	<title>CodeCamp Manager {userCampusName ? `[${userCampusName}]` : ''}</title>
</svelte:head>

<ModeWatcher />

<div style="display: contents">
	<Toaster richColors position="top-center" />

	<!-- Campus Indicator Overlay -->
	{#if userCampusName}
		<div
			class="pointer-events-none fixed right-4 bottom-4 z-50 hidden text-muted-foreground opacity-20 md:block"
		>
			<span class="font-heading text-4xl font-black tracking-tighter uppercase"
				>{userCampusName}</span
			>
		</div>
	{/if}

	{@render children()}
</div>
