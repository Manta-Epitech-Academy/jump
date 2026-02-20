<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Sprout } from 'lucide-svelte';

	let {
		student,
		subText = null,
		showBadge = false,
		size = 'md'
	}: {
		student: any;
		subText?: string | null;
		showBadge?: boolean;
		size?: 'sm' | 'md';
	} = $props();

	let initials = $derived(((student.prenom?.[0] ?? '') + (student.nom?.[0] ?? '')).toUpperCase());

	let isNew = $derived((student.events_count || 0) === 0);

	function formatFirstName(name: string | undefined) {
		if (!name) return '';
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}
</script>

<div class="flex items-center gap-3">
	<Avatar.Root class={size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'}>
		<Avatar.Fallback class="bg-muted font-bold">
			{initials}
		</Avatar.Fallback>
	</Avatar.Root>
	<div class="flex flex-col">
		<span class="flex items-center gap-2 truncate text-sm font-bold">
			<span>
				{formatFirstName(student.prenom)} <span class="uppercase">{student.nom}</span>
			</span>
			{#if showBadge && isNew}
				<Badge
					variant="outline"
					class="gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
				>
					<Sprout class="h-2.5 w-2.5" />
					Nouveau
				</Badge>
			{/if}
		</span>
		{#if subText}
			<span class="text-xs text-muted-foreground">{subText}</span>
		{/if}
	</div>
</div>
