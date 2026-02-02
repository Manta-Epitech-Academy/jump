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
	let userCampusCode = $derived(page.data.user?.expand?.campus?.code);
	let userCampusColor = $derived(page.data.user?.expand?.campus?.color || '#013afb');
</script>

<svelte:head>
	<title>CodeCamp Manager {userCampusCode ? `[${userCampusCode}]` : ''}</title>
</svelte:head>

<ModeWatcher />

<div style="display: contents">
	<Toaster richColors position="top-center" />

	<!-- Campus Indicator Overlay -->
	{#if userCampusCode}
		<div
			class="pointer-events-none fixed right-4 bottom-4 z-50 hidden opacity-20 md:block"
			style="color: {userCampusColor}"
		>
			<span class="font-heading text-6xl font-black tracking-tighter uppercase"
				>{userCampusCode}</span
			>
		</div>
	{/if}

	{@render children()}
</div>
