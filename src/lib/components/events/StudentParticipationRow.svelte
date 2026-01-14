<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import { ArrowRightLeft, Ban, Sparkles, Trash2, TriangleAlert } from 'lucide-svelte';

	let {
		participation,
		subjects,
		isUnassigned = false,
		onDelete
	}: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		participation: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		subjects: any[];
		isUnassigned?: boolean;
		onDelete: (id: string) => void;
	} = $props();

	function formatFirstName(name: string | undefined) {
		if (!name) return '';
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}

	// Derived alerts based on passed participation data
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let alerts = $derived(participation.alerts || []);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let dangerAlert = $derived(alerts.find((a: any) => a.type === 'danger'));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let warningAlert = $derived(alerts.find((a: any) => a.type === 'warning'));
</script>

<div
	class="group relative flex items-center justify-between rounded-sm p-3 transition-all
    {dangerAlert
		? 'border-2 border-dashed border-destructive bg-red-50'
		: warningAlert
			? 'border-y border-r border-l-4 border-y-orange-200 border-r-orange-200 border-l-epi-orange bg-orange-50'
			: 'border border-l-4 border-l-transparent bg-card hover:border-epi-blue'}"
>
	<div class="flex items-center gap-4">
		<div class="relative">
			<Avatar.Root
				class="rounded-sm border-2
                {dangerAlert
					? 'border-destructive'
					: warningAlert
						? 'border-epi-orange'
						: 'border-transparent'}"
			>
				<Avatar.Fallback class="bg-primary/5 font-bold text-primary">
					{participation.expand.student.prenom[0]}{participation.expand.student.nom[0]}
				</Avatar.Fallback>
			</Avatar.Root>
			{#if dangerAlert}
				<div class="absolute -top-2 -right-2 rounded-full bg-white">
					<Ban class="h-5 w-5 fill-destructive/20 text-destructive" />
				</div>
			{:else if warningAlert}
				<div class="absolute -top-2 -right-2">
					<TriangleAlert class="h-5 w-5 fill-white text-epi-orange" />
				</div>
			{/if}
		</div>
		<div>
			<p class="text-sm font-bold {dangerAlert ? 'text-destructive' : ''}">
				{formatFirstName(participation.expand.student.prenom)}
				<span class="uppercase">{participation.expand.student.nom}</span>
			</p>
			<div class="mt-0.5 flex flex-col gap-1">
				<span class="text-xs font-black text-muted-foreground uppercase">
					{participation.expand.student.niveau}
				</span>
				{#if dangerAlert}
					<Badge variant="destructive" class="w-fit text-[9px] font-black uppercase">
						{dangerAlert.message}
					</Badge>
				{/if}
				{#if warningAlert}
					<div class="flex items-center gap-1 text-epi-orange">
						<span class="text-[10px] font-black uppercase">
							{warningAlert.message}
						</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div class="flex items-center gap-3">
		{#if isUnassigned}
			<span class="animate-pulse text-[10px] font-black tracking-widest text-epi-orange uppercase">
				Sélection requise
			</span>
		{:else}
			{@const isGoodFit =
				participation.expand?.subject?.niveaux?.includes(participation.expand.student.niveau) &&
				!dangerAlert}
			{#if isGoodFit}
				<Badge
					class="h-6 gap-1.5 border-none bg-epi-teal px-2 text-[10px] font-black tracking-widest text-black uppercase shadow-sm"
				>
					<Sparkles class="h-3 w-3" />
					Optimal
				</Badge>
			{/if}
		{/if}

		<!-- Subject Selection Form -->
		<form action="?/assignSubject" method="POST" use:enhance>
			<input type="hidden" name="participationId" value={participation.id} />
			<Select.Root
				type="single"
				name="subjectId"
				onValueChange={(v) => {
					// Manual form submission trigger to avoid needing a save button
					const form = document.createElement('form');
					form.method = 'POST';
					form.action = '?/assignSubject';
					const pId = document.createElement('input');
					pId.name = 'participationId';
					pId.value = participation.id;
					const sId = document.createElement('input');
					sId.name = 'subjectId';
					sId.value = v;
					form.appendChild(pId);
					form.appendChild(sId);
					document.body.appendChild(form);
					form.submit();
				}}
			>
				<Select.Trigger
					class="h-8 w-[170px] px-3 text-[10px] font-bold uppercase transition-opacity {isUnassigned
						? 'border-epi-orange text-epi-orange opacity-100'
						: 'opacity-0 group-hover:opacity-100'}"
				>
					<ArrowRightLeft class="mr-1 h-3 w-3" />
					{isUnassigned ? 'Assigner sujet' : 'Changer de sujet'}
				</Select.Trigger>
				<Select.Content>
					{#if !isUnassigned}
						<Select.Item value="none" class="text-destructive">Retirer du sujet</Select.Item>
						<Separator class="my-1" />
					{/if}
					{#each subjects as sub}
						<Select.Item value={sub.id}>{sub.nom}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</form>

		<Button
			variant="ghost"
			size="icon"
			class="h-8 w-8 text-muted-foreground hover:text-destructive"
			onclick={() => onDelete(participation.id)}
		>
			<Trash2 class="h-4 w-4" />
		</Button>
	</div>
</div>
