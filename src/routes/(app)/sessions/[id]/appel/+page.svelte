<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { pbUrl } from '$lib/pocketbase';
	import PocketBase from 'pocketbase';
	import { ArrowLeft, User, Trophy, Search, CircleCheck } from 'lucide-svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';

	let { data }: { data: PageData } = $props();

	let participations = $state(data.participations);
	let searchQuery = $state('');
	let filterStatus = $state<'all' | 'present' | 'validated'>('all');

	$effect(() => {
		participations = data.participations;
	});

	const pb = new PocketBase(pbUrl);
	if (browser) {
		pb.authStore.loadFromCookie(document.cookie);
	}

	$effect(() => {
		pb.collection('participations').subscribe('*', (e) => {
			if (e.record.session !== data.session.id) return;
			if (e.action === 'update') {
				const index = participations.findIndex((p) => p.id === e.record.id);
				if (index !== -1) {
					participations[index] = {
						...participations[index],
						is_present: e.record.is_present,
						is_validated: e.record.is_validated
					};
				}
			} else if (e.action === 'create' || e.action === 'delete') {
				location.reload();
			}
		});
		return () => pb.collection('participations').unsubscribe('*');
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

	function formatFirstName(name: string | undefined) {
		if (!name) return '';
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}

	let presentCount = $derived(participations.filter((p) => p.is_present).length);
	let validatedCount = $derived(participations.filter((p) => p.is_validated).length);
</script>

<div class="flex min-h-screen flex-col bg-gray-50/50 pb-20">
	<div class="sticky top-0 z-20 border-b bg-white/80 pt-4 pb-4 backdrop-blur-md">
		<div class="container mx-auto max-w-2xl px-4">
			<div class="mb-4 flex items-center justify-between">
				<a
					href="/sessions/{data.session.id}/builder"
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

			<!-- Titre mis à jour -->
			<h1 class="text-xl font-bold uppercase">Appel : {data.session.titre}</h1>

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
			<div transition:fly={{ y: 10, duration: 200 }}>
				<Card.Root
					class="overflow-hidden border-2 shadow-sm transition-all duration-200 {p.is_validated
						? 'border-epi-teal bg-white'
						: p.is_present
							? 'border-epi-blue bg-white'
							: 'border-transparent opacity-80'}"
				>
					<Card.Content class="flex items-center p-4">
						<div class="flex flex-1 items-center gap-4">
							<div class="relative">
								<Avatar.Root
									class="h-12 w-12 rounded-sm border-2 {p.is_present
										? 'border-epi-blue'
										: 'border-gray-200'}"
								>
									<Avatar.Fallback class="bg-gray-50 font-bold">
										{(p.expand?.student?.prenom?.[0] ?? '').toUpperCase()}{(
											p.expand?.student?.nom?.[0] ?? ''
										).toUpperCase()}
									</Avatar.Fallback>
								</Avatar.Root>
								{#if p.is_validated}
									<div
										class="absolute -right-1 -bottom-1 rounded-full bg-epi-teal p-0.5 text-black ring-2 ring-white"
									>
										<CircleCheck class="h-3 w-3" />
									</div>
								{/if}
							</div>
							<div class="flex flex-col">
								<span class="text-base leading-none font-bold"
									>{formatFirstName(p.expand?.student?.prenom)}
									<span class="uppercase">{p.expand?.student?.nom}</span></span
								>
								<span class="mt-1 text-xs font-bold tracking-wider text-muted-foreground uppercase"
									>{p.expand?.student?.niveau}</span
								>
							</div>
						</div>

						<div class="flex items-center gap-2">
							<form
								method="POST"
								action="?/togglePresent"
								use:enhance={optimisticToggle(p.id, 'is_present')}
							>
								<input type="hidden" name="id" value={p.id} /><input
									type="hidden"
									name="state"
									value={p.is_present.toString()}
								/>
								<Button
									type="submit"
									variant={p.is_present ? 'default' : 'outline'}
									size="icon"
									class="h-12 w-12 rounded-sm transition-all {p.is_present
										? 'bg-epi-blue'
										: 'text-gray-400 hover:text-epi-blue'}"
								>
									<User class="h-6 w-6" />
								</Button>
							</form>

							<form
								method="POST"
								action="?/toggleValidated"
								use:enhance={optimisticToggle(p.id, 'is_validated')}
							>
								<input type="hidden" name="id" value={p.id} /><input
									type="hidden"
									name="state"
									value={p.is_validated.toString()}
								/>
								<Button
									type="submit"
									variant={p.is_validated ? 'default' : 'outline'}
									size="icon"
									disabled={!p.is_present}
									class="h-12 w-12 rounded-sm transition-all {p.is_validated
										? 'bg-epi-teal text-black hover:bg-epi-teal'
										: 'text-gray-400 hover:text-epi-teal'}"
								>
									<Trophy class="h-6 w-6" />
								</Button>
							</form>
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		{:else}
			<div class="py-20 text-center">
				<p class="font-bold text-muted-foreground uppercase">Aucun élève à afficher.</p>
			</div>
		{/each}
	</div>
</div>
