<script lang="ts">
	import type { PageData } from './$types';
	import { pbUrl } from '$lib/pocketbase';
	import PocketBase from 'pocketbase';
	import { ArrowLeft, Search, MonitorSmartphone } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import ParticipationCard from '$lib/components/events/ParticipationCard.svelte';

	let { data }: { data: PageData } = $props();

	let participations = $state(untrack(() => data.participations));
	let searchQuery = $state('');
	let filterStatus = $state<'all' | 'present'>('all');

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

	let filteredParticipations = $derived(
		participations.filter((p) => {
			const matchesSearch =
				p.expand?.student?.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.expand?.student?.prenom.toLowerCase().includes(searchQuery.toLowerCase());
			if (!matchesSearch) return false;
			if (filterStatus === 'present') return p.is_present;
			return true;
		})
	);

	let presentCount = $derived(participations.filter((p) => p.is_present).length);

	// Logistics Metrics
	let totalStudents = $derived(participations.length);
	let pcsNeeded = $derived(participations.filter((p) => !p.bring_pc).length);
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

			<div class="mt-4 flex flex-col gap-3 sm:flex-row">
				<div class="relative flex-1">
					<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher un élève..."
						class="rounded-sm bg-card pl-9"
						bind:value={searchQuery}
					/>
				</div>
				<div class="flex gap-1">
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
	</div>

	<div class="container mx-auto mt-6 max-w-2xl space-y-3 px-4">
		{#each filteredParticipations as p (p.id)}
			<ParticipationCard participation={p} event={data.event} {optimisticToggle} />
		{:else}
			<div class="py-20 text-center">
				<p class="font-bold text-muted-foreground uppercase">Aucun élève à afficher.</p>
			</div>
		{/each}
	</div>
</div>
