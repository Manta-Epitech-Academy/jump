<script lang="ts">
	import type { PageData } from './$types';
	import { pbUrl } from '$lib/pocketbase';
	import PocketBase from 'pocketbase';
	import {
		ArrowLeft,
		Search,
		MonitorSmartphone,
		LayoutGrid,
		List as ListIcon,
		Filter,
		User,
		MonitorX,
		Award
	} from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import ParticipationCard from '$lib/components/events/ParticipationCard.svelte';
	import DiplomaTemplate from '$lib/components/diploma/DiplomaTemplate.svelte';
	import { generateDiplomaFromHTML } from '$lib/pdfUtils';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils';
	import { enhance } from '$app/forms';

	let { data }: { data: PageData } = $props();

	let participations = $state(untrack(() => data.participations));
	let searchQuery = $state('');
	let filterStatus = $state<'all' | 'present'>('all');

	// NEW STATES
	let viewMode = $state<'grid' | 'list'>('grid');
	let filterSubject = $state<string>('all');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let diplomaData = $state<{ student: any; event: any; subject: any }>({
		student: null,
		event: null,
		subject: null
	});

	$effect(() => {
		participations = data.participations;
	});

	const pb = new PocketBase(pbUrl);

	$effect(() => {
		if (browser) {
			pb.authStore.loadFromCookie(document.cookie);

			pb.collection('participations').subscribe('*', (e) => {
				if (e.record.event !== data.event.id) return;
				if (e.action === 'update') {
					const index = participations.findIndex((p) => p.id === e.record.id);
					if (index !== -1) {
						participations[index] = {
							...participations[index],
							is_present: e.record.is_present,
							bring_pc: e.record.bring_pc,
							note: e.record.note
						};
					}
				} else if (e.action === 'create' || e.action === 'delete') {
					location.reload();
				}
			});
		}
		return () => {
			if (browser) pb.collection('participations').unsubscribe('*');
		};
	});

	const optimisticToggle = (id: string, field: 'is_present' | 'bring_pc') => {
		return ({ formData }: { formData: FormData }) => {
			const index = participations.findIndex((p) => p.id === id);
			if (index !== -1) {
				const p = participations[index];
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				if (field === 'is_present') p.is_present = !p.is_present;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				if (field === 'bring_pc') p.bring_pc = !p.bring_pc;
			}
			return async ({ update }: { update: () => Promise<void> }) => await update();
		};
	};

	// Get unique subjects for filter dropdown
	let uniqueSubjects = $derived.by(() => {
		const subjects = new Map();
		data.participations.forEach((p) => {
			if (p.expand?.subject) {
				subjects.set(p.expand.subject.id, p.expand.subject.nom);
			}
		});
		return Array.from(subjects.entries());
	});

	let filteredParticipations = $derived(
		participations.filter((p) => {
			const matchesSearch =
				p.expand?.student?.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.expand?.student?.prenom.toLowerCase().includes(searchQuery.toLowerCase());

			if (!matchesSearch) return false;

			const matchesStatus = filterStatus === 'all' || (filterStatus === 'present' && p.is_present);

			const matchesSubject = filterSubject === 'all' || p.expand?.subject?.id === filterSubject;

			return matchesStatus && matchesSubject;
		})
	);

	let presentCount = $derived(participations.filter((p) => p.is_present).length);

	// Logistics Metrics
	let totalStudents = $derived(participations.length);
	let pcsNeeded = $derived(participations.filter((p) => !p.bring_pc).length);

	// --- DIPLOMA HANDLER ---
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function handleDiplomaDownload(participation: any) {
		// Update data for the hidden template
		diplomaData = {
			student: participation.expand.student,
			event: data.event,
			subject: participation.expand.subject
		};

		// Allow slight delay for DOM to update the hidden component
		setTimeout(async () => {
			try {
				const filename = `Diplome_${participation.expand.student.nom}_${participation.expand.student.prenom}.pdf`;
				await generateDiplomaFromHTML('diploma-render-target', filename);
				toast.success('Diplôme téléchargé !');
			} catch (e) {
				console.error(e);
				toast.error('Erreur lors de la génération du PDF');
			}
		}, 100);
	}
</script>

<div class="flex min-h-screen flex-col bg-background pb-20">
	<div class="sticky top-0 z-20 border-b border-border bg-background/80 pt-4 pb-4 backdrop-blur-md">
		<div class="container mx-auto max-w-2xl px-4">
			<div class="mb-4 flex items-center justify-between">
				<a
					href="/events/{data.event.id}/builder"
					class="flex items-center gap-1 text-xs font-black tracking-widest text-muted-foreground uppercase transition-colors hover:text-epi-blue"
				>
					<ArrowLeft class="h-3 w-3" /> Retour au builder
				</a>
				<div class="flex gap-2">
					<div
						class="rounded-sm bg-epi-teal px-2 py-0.5 text-[10px] font-black text-black uppercase"
					>
						{presentCount} Présents
					</div>
				</div>
			</div>

			<h1 class="text-xl font-bold uppercase">
				Appel : <span style:view-transition-name="event-title-{data.event.id}"
					>{data.event.titre}</span
				>
			</h1>

			<!-- LOGISTICS DASHBOARD -->
			<div
				class="mt-4 grid grid-cols-2 gap-4 rounded-sm border border-border bg-slate-900 p-4 text-white shadow-md sm:grid-cols-2 dark:bg-card"
			>
				<div class="flex flex-col">
					<span class="text-[10px] font-black tracking-widest text-slate-400 uppercase"
						>Total Élèves</span
					>
					<span class="text-2xl font-bold">{totalStudents}</span>
				</div>
				<div class="flex items-center justify-between border-l border-slate-700 pl-4">
					<div class="flex flex-col">
						<span class="text-[10px] font-black tracking-widest text-epi-orange uppercase"
							>PC à Préparer</span
						>
						<span class="text-3xl font-bold text-epi-orange">{pcsNeeded}</span>
					</div>
					<MonitorSmartphone class="h-8 w-8 text-slate-700" />
				</div>
			</div>

			<!-- IMPROVED TOOLBAR -->
			<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
				<div class="relative flex-1">
					<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher un élève..."
						class="rounded-sm bg-card pl-9"
						bind:value={searchQuery}
					/>
				</div>

				<!-- SUBJECT FILTER -->
				<Select.Root type="single" bind:value={filterSubject}>
					<Select.Trigger class="h-9 w-[180px] text-xs">
						<Filter class="mr-2 h-3 w-3" />
						{filterSubject === 'all'
							? 'Tous les sujets'
							: uniqueSubjects.find((s) => s[0] === filterSubject)?.[1]}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">Tous les sujets</Select.Item>
						{#each uniqueSubjects as [id, nom]}
							<Select.Item value={id}>{nom}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<!-- VIEW TOGGLE -->
				<div class="flex rounded-md border bg-card p-1">
					<button
						class={cn(
							'rounded-sm p-1.5 transition-all',
							viewMode === 'grid'
								? 'bg-muted text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						)}
						onclick={() => (viewMode = 'grid')}
						title="Vue Grille"
					>
						<LayoutGrid class="h-4 w-4" />
					</button>
					<button
						class={cn(
							'rounded-sm p-1.5 transition-all',
							viewMode === 'list'
								? 'bg-muted text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						)}
						onclick={() => (viewMode = 'list')}
						title="Vue Liste"
					>
						<ListIcon class="h-4 w-4" />
					</button>
				</div>
			</div>

			<div class="mt-2 flex gap-1">
				<Button
					variant={filterStatus === 'all' ? 'default' : 'outline'}
					size="sm"
					class="h-9 text-[10px]"
					onclick={() => (filterStatus = 'all')}>Tous</Button
				>
				<Button
					variant={filterStatus === 'present' ? 'default' : 'outline'}
					size="sm"
					class="h-9 text-[10px]"
					onclick={() => (filterStatus = 'present')}>Présents</Button
				>
			</div>
		</div>
	</div>

	<!-- DATA DISPLAY -->
	<div class="container mx-auto mt-6 max-w-2xl px-4 pb-20">
		{#if viewMode === 'grid'}
			<div class="space-y-3">
				{#each filteredParticipations as p (p.id)}
					<ParticipationCard
						participation={p}
						event={data.event}
						{optimisticToggle}
						onDownload={() => handleDiplomaDownload(p)}
					/>
				{/each}
			</div>
		{:else}
			<!-- COMPACT LIST VIEW -->
			<div class="rounded-sm border bg-card">
				{#each filteredParticipations as p (p.id)}
					<div
						class="flex items-center justify-between border-b p-3 last:border-0 hover:bg-muted/20"
					>
						<div class="flex items-center gap-3">
							<!-- Simple Status Indicator -->
							<form
								method="POST"
								action="?/togglePresent"
								use:enhance={optimisticToggle(p.id, 'is_present')}
							>
								<input type="hidden" name="id" value={p.id} />
								<input type="hidden" name="state" value={p.is_present.toString()} />
								<button
									type="submit"
									class={cn(
										'flex h-8 w-8 items-center justify-center rounded-sm border transition-all',
										p.is_present
											? 'border-epi-teal bg-epi-teal text-black'
											: 'border-border text-muted-foreground hover:border-epi-teal'
									)}
								>
									<User class="h-4 w-4" />
								</button>
							</form>

							<div class="flex flex-col">
								<span class="text-sm font-bold">
									{p.expand?.student?.prenom}
									<span class="uppercase">{p.expand?.student?.nom}</span>
								</span>
								<div class="flex items-center gap-2 text-[10px] text-muted-foreground uppercase">
									<span>{p.expand?.student?.niveau}</span>
									{#if p.expand?.subject}
										<span>• {p.expand.subject.nom}</span>
									{/if}
								</div>
							</div>
						</div>

						<!-- Note Input (Compact) -->
						{#if p.is_present}
							<div class="flex items-center gap-2">
								{#if !p.bring_pc}
									<MonitorX class="h-4 w-4 text-orange-400" title="Pas de PC" />
								{/if}
								<form action="?/updateNote" method="POST" use:enhance>
									<input type="hidden" name="id" value={p.id} />
									<Input name="note" value={p.note} placeholder="..." class="h-7 w-32 text-xs" />
								</form>
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									onclick={() => handleDiplomaDownload(p)}
								>
									<Award class="h-4 w-4" />
								</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if filteredParticipations.length === 0}
			<div class="py-20 text-center">
				<p class="font-bold text-muted-foreground uppercase">Aucun élève à afficher.</p>
			</div>
		{/if}
	</div>
</div>

<!-- HIDDEN RENDER TARGET FOR DIPLOMAS -->
<!-- Positioned far off-screen so user doesn't see it flickering, but html2canvas can capture it. -->
<div class="fixed top-0 left-[-9999px] z-[-1]">
	{#if diplomaData.student}
		<DiplomaTemplate
			student={diplomaData.student}
			event={diplomaData.event}
			subject={diplomaData.subject}
		/>
	{/if}
</div>
