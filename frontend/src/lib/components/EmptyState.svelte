<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Component } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		icon: Icon,
		title,
		description,
		actionLabel,
		actionLink,
		actionCallback,
		class: className
	}: {
		icon: Component<{ class?: string }>;
		title: string;
		description: string;
		actionLabel?: string;
		actionLink?: string;
		actionCallback?: () => void;
		class?: string;
	} = $props();
</script>

<div
	class={cn(
		'flex animate-in flex-col items-center justify-center rounded-sm border-2 border-dashed border-border bg-muted/20 p-12 text-center duration-200 fade-in slide-in-from-bottom-1 md:p-20',
		className
	)}
>
	<div class="relative mb-6">
		<!-- Subtle pulse effect matching the Epitech theme -->
		<div class="absolute inset-0 animate-ping rounded-full bg-epi-blue/10"></div>
		<div
			class="relative flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm"
		>
			<Icon class="h-10 w-10 text-muted-foreground/70" />
		</div>
	</div>

	<h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
		{title}<span class="text-epi-teal">_</span>
	</h3>

	<p class="mt-3 max-w-sm text-sm font-medium text-muted-foreground italic">
		{@html description}
	</p>

	{#if actionLabel}
		<div class="mt-8">
			{#if actionLink}
				<Button
					href={actionLink}
					class="bg-epi-blue text-white shadow-lg transition-transform hover:scale-105 hover:bg-epi-blue/90"
				>
					{actionLabel}
				</Button>
			{:else if actionCallback}
				<Button
					onclick={actionCallback}
					class="bg-epi-blue text-white shadow-lg transition-transform hover:scale-105 hover:bg-epi-blue/90"
				>
					{actionLabel}
				</Button>
			{/if}
		</div>
	{/if}
</div>
