<script lang="ts">
	import '@fontsource/anton';
	import '@fontsource-variable/ibm-plex-sans';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>CodeCamp Manager</title>
</svelte:head>

<div style="display: contents">
	{@render children()}
</div>
