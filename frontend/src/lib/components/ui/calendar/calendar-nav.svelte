<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<nav
	{...restProps}
	bind:this={ref}
	class={cn("absolute inset-x-0 top-0 z-10 flex w-full items-center justify-between gap-1 pointer-events-none", className)}
>
	{@render children?.()}
</nav>
