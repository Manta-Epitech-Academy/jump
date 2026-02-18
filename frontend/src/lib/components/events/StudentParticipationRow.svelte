<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		ArrowRightLeft,
		Ban,
		Trash2,
		TriangleAlert,
		BookOpen,
		Plus,
		Sprout
	} from 'lucide-svelte';

	let {
		participation,
		onDelete,
		onManageSubjects
	}: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		participation: any;
		onDelete: (id: string) => void;
		onManageSubjects: (participationId: string, currentSubjectIds: string[]) => void;
	} = $props();

	function formatFirstName(name: string | undefined) {
		if (!name) return '';
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}

	let subjects = $derived(participation.expand?.subjects || []);
	let hasSubjects = $derived(subjects.length > 0);

	let isNewStudent = $derived.by(() => {
		const count = participation.expand?.student?.events_count || 0;
		const isPresent = participation.is_present ? 1 : 0;
		return count - isPresent === 0;
	});

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
			<div class="flex items-center gap-2">
				<p class="text-sm font-bold {dangerAlert ? 'text-destructive' : ''}">
					{formatFirstName(participation.expand.student.prenom)}
					<span class="uppercase">{participation.expand.student.nom}</span>
				</p>
				{#if isNewStudent}
					<Badge
						variant="outline"
						class="gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
					>
						<Sprout class="h-2.5 w-2.5" />
						Nouveau
					</Badge>
				{/if}
			</div>

			<div class="mt-0.5 flex flex-col gap-1">
				<span class="text-xs font-black text-muted-foreground uppercase">
					{participation.expand.student.niveau}
				</span>
				{#if dangerAlert}
					<Badge variant="destructive" class="w-fit text-[9px] font-black uppercase">
						Attention : sujet déjà fait par le passé
					</Badge>
				{/if}
			</div>
		</div>
	</div>

	<!-- DISPLAY SUBJECTS LIST -->
	<div class="flex flex-1 flex-wrap items-center gap-2 px-6">
		{#if hasSubjects}
			{#each subjects as sub}
				<Badge variant="secondary" class="gap-1.5 border bg-muted/50 px-2 text-[10px] font-bold">
					<BookOpen class="h-3 w-3 text-muted-foreground" />
					{sub.nom}
				</Badge>
			{/each}
		{:else}
			<span class="animate-pulse text-[10px] font-black tracking-widest text-epi-orange uppercase">
				Sélection requise
			</span>
		{/if}
	</div>

	<div class="flex items-center gap-3">
		<!-- Trigger the Subject Manager Modal -->
		<Button
			variant="outline"
			size="sm"
			class="h-8 gap-2 px-3 text-[10px] font-bold uppercase transition-opacity {!hasSubjects
				? 'border-epi-orange text-epi-orange opacity-100 hover:bg-epi-orange hover:text-white'
				: 'opacity-0 group-hover:opacity-100'}"
			onclick={() =>
				onManageSubjects(
					participation.id,
					subjects.map((s: any) => s.id)
				)}
		>
			{#if !hasSubjects}
				<Plus class="h-3 w-3" />
				Assigner
			{:else}
				<ArrowRightLeft class="h-3 w-3" />
				Gérer
			{/if}
		</Button>

		<div class="shake-on-hover">
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8 text-muted-foreground hover:text-destructive"
				onclick={() => onDelete(participation.id)}
			>
				<Trash2 class="trash-icon h-4 w-4" />
			</Button>
		</div>
	</div>
</div>
