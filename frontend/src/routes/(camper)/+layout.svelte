<script lang="ts">
	import '../../routes/layout.css';
	let { children } = $props();
</script>

<div class="camper-layout min-h-screen bg-background text-foreground">
	{@render children()}
</div>
