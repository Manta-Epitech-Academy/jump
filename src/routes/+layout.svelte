<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>CodeCamp Manager</title>
</svelte:head>

<div style="display: contents">
	{@render children()}
</div>
