<script lang="ts">
	import '@fontsource/anton';
	import '@fontsource-variable/ibm-plex-sans';
	import './layout.css';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<svelte:head>
	<title>CodeCamp Manager</title>
</svelte:head>

<div style="display: contents">
	<Toaster richColors position="top-center" />
	{@render children()}
</div>
