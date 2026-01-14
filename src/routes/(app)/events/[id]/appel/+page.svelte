<script lang="ts">
	import type { PageData } from './$types';
	import { pbUrl } from '$lib/pocketbase';
	import PocketBase from 'pocketbase';
	import { ArrowLeft, Search } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import ParticipationCard from '$lib/components/events/ParticipationCard.svelte';

	let { data }: { data: PageData } = $props();

	let participations = $state(untrack(() => data.participations));
	let searchQuery = $state('');
	let filterStatus = $state<'all' | 'present' | 'validated'>('all');

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
							is_validated: e.record.is_validated,
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

	const optimisticToggle = (id: string, field: 'is_present' | 'is_validated') => {
		return ({ formData }: { formData: FormData }) => {
			const index = participations.findIndex((p) => p.id === id);
			if (index !== -1) {
				const p = participations[index];
				if (field === 'is_present') p.is_present = !p.is_present;
				if (field === 'is_validated') p.is_validated = !p.is_validated;
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
			if (filterStatus === 'validated') return p.is_validated;
			return true;
		})
	);

	let presentCount = $derived(participations.filter((p) => p.is_present).length);
	let validatedCount = $derived(participations.filter((p) => p.is_validated).length);
</script>

<div class="flex min-h-screen flex-col bg-gray-50/50 pb-20">
	<div class="sticky top-0 z-20 border-b bg-white/80 pt-4 pb-4 backdrop-blur-md">
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
						class="rounded-sm bg-epi-blue px-2 py-0.5 text-[10px] font-black text-white uppercase"
					>
						{presentCount} Présents
					</div>
					<div
						class="rounded-sm bg-epi-teal px-2 py-0.5 text-[10px] font-black text-black uppercase"
					>
						{validatedCount} Validés
					</div>
				</div>
			</div>

			<h1 class="text-xl font-bold uppercase">
				Appel : <span style:view-transition-name="event-title-{data.event.id}"
					>{data.event.titre}</span
				>
			</h1>

			<div class="mt-4 flex flex-col gap-3 sm:flex-row">
				<div class="relative flex-1">
					<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher un élève..."
						class="rounded-sm bg-white pl-9"
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
					<Button
						variant={filterStatus === 'validated' ? 'default' : 'outline'}
						size="sm"
						class="h-9 text-[10px]"
						onclick={() => (filterStatus = 'validated')}>Validés</Button
					>
				</div>
			</div>
		</div>
	</div>

	<div class="container mx-auto mt-6 max-w-2xl space-y-3 px-4">
		{#each filteredParticipations as p (p.id)}
			<ParticipationCard participation={p} {optimisticToggle} />
		{:else}
			<div class="py-20 text-center">
				<p class="font-bold text-muted-foreground uppercase">Aucun élève à afficher.</p>
			</div>
		{/each}
	</div>
</div>
