<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { pbUrl } from '$lib/pocketbase';
	import PocketBase from 'pocketbase';
	import {
		ArrowLeft,
		User,
		Trophy,
		Search,
		UserCheck,
		Funnel,
		CircleCheck,
		CircleX
	} from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { browser } from '$app/environment';
	import { fly, fade } from 'svelte/transition';

	let { data }: { data: PageData } = $props();

	let participations = $state(data.participations);
	let searchQuery = $state('');
	let filterStatus = $state<'all' | 'present' | 'validated'>('all');

	$effect(() => {
		participations = data.participations;
	});

	// --- Realtime PocketBase ---
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

		return () => {
			pb.collection('participations').unsubscribe('*');
		};
	});

	// --- Optimistic UI Updates ---
	const optimisticToggle = (id: string, field: 'is_present' | 'is_validated') => {
		return ({ formData }: { formData: FormData }) => {
			const index = participations.findIndex((p) => p.id === id);
			if (index !== -1) {
				const p = participations[index];
				if (field === 'is_present') p.is_present = !p.is_present;
				if (field === 'is_validated') p.is_validated = !p.is_validated;
			}

			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
			};
		};
	};

	// --- Computed / Derived ---
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

<div class="flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50/50 pb-20 dark:bg-slate-950/50">
	<!-- Sticky Header -->
	<div
		class="sticky top-14 z-20 border-b bg-background/80 pt-4 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/60"
	>
		<!-- Top Bar: Navigation & Stats -->
		<div class="container mx-auto max-w-2xl px-4">
			<div class="mb-4 flex items-center justify-between">
				<a
					href="/sessions/{data.session.id}/builder"
					class="flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft class="mr-2 h-4 w-4" />
					Retour
				</a>
				<div class="flex gap-2">
					<Badge variant="secondary" class="font-mono">
						{presentCount} Présents
					</Badge>
					<Badge variant="outline" class="border-green-500/50 font-mono text-green-600">
						{validatedCount} Validés
					</Badge>
				</div>
			</div>

			<h1 class="mb-1 truncate text-xl font-bold tracking-tight">{data.session.titre}</h1>

			<!-- Search & Filter Bar -->
			<div class="mt-4 flex flex-col gap-3 pb-2 sm:flex-row">
				<div class="relative flex-1">
					<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher un élève..."
						class="bg-background pl-9"
						bind:value={searchQuery}
					/>
					{#if searchQuery}
						<button
							onclick={() => (searchQuery = '')}
							class="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground"
						>
							<CircleX class="h-4 w-4" />
						</button>
					{/if}
				</div>

				<div class="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
					<Button
						variant={filterStatus === 'all' ? 'default' : 'outline'}
						size="sm"
						class="rounded-full"
						onclick={() => (filterStatus = 'all')}
					>
						Tous
					</Button>
					<Button
						variant={filterStatus === 'present' ? 'default' : 'outline'}
						size="sm"
						class="rounded-full"
						onclick={() => (filterStatus = 'present')}
					>
						<UserCheck class="mr-1 h-3 w-3" />
						Présents
					</Button>
					<Button
						variant={filterStatus === 'validated' ? 'default' : 'outline'}
						size="sm"
						class="rounded-full"
						onclick={() => (filterStatus = 'validated')}
					>
						<Trophy class="mr-1 h-3 w-3" />
						Validés
					</Button>
				</div>
			</div>
		</div>
	</div>

	<!-- List -->
	<div class="container mx-auto mt-4 max-w-2xl space-y-3 px-4">
		{#each filteredParticipations as p (p.id)}
			<div transition:fly={{ y: 20, duration: 300 }}>
				<Card.Root
					class="overflow-hidden transition-all duration-300 {p.is_validated
						? 'border-green-500 bg-green-50/30 dark:bg-green-950/20'
						: p.is_present
							? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/20'
							: 'opacity-90 hover:opacity-100'}"
				>
					<Card.Content class="flex items-center p-3 sm:p-4">
						<!-- Avatar & Info -->
						<div class="flex flex-1 items-center gap-3 sm:gap-4">
							<div class="relative">
								<Avatar.Root
									class="h-12 w-12 border-2 bg-background {p.is_present
										? 'border-blue-500'
										: 'border-transparent'}"
								>
									<Avatar.Fallback class="text-lg font-bold">
										{p.expand?.student?.prenom?.[0] ?? '?'}{p.expand?.student?.nom?.[0] ?? '?'}
									</Avatar.Fallback>
								</Avatar.Root>
								{#if p.is_validated}
									<div
										transition:fade
										class="absolute -right-1 -bottom-1 rounded-full bg-green-500 p-0.5 text-white shadow-sm ring-2 ring-white dark:ring-slate-950"
									>
										<CircleCheck class="h-3 w-3" />
									</div>
								{/if}
							</div>

							<div class="flex min-w-0 flex-col">
								<span class="truncate text-base leading-tight font-semibold sm:text-lg">
									{p.expand?.student?.prenom}
									{p.expand?.student?.nom}
								</span>
								<span class="flex items-center gap-1 text-xs text-muted-foreground">
									{p.expand?.student?.niveau}
									{#if p.is_present && !p.is_validated}
										<span class="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500"></span>
										<span class="text-blue-600 dark:text-blue-400">En cours</span>
									{/if}
								</span>
							</div>
						</div>

						<!-- Actions Big Buttons -->
						<div class="ml-2 flex items-center gap-2 sm:gap-3">
							<!-- Action: Appel -->
							<form
								method="POST"
								action="?/togglePresent"
								use:enhance={optimisticToggle(p.id, 'is_present')}
							>
								<input type="hidden" name="id" value={p.id} />
								<input type="hidden" name="state" value={p.is_present.toString()} />
								<Button
									type="submit"
									variant={p.is_present ? 'default' : 'ghost'}
									size="icon"
									class="h-10 w-10 rounded-full transition-all sm:h-12 sm:w-12 {p.is_present
										? 'bg-blue-600 hover:bg-blue-700'
										: 'text-muted-foreground hover:bg-muted'}"
									aria-label={p.is_present ? 'Marquer absent' : 'Marquer présent'}
								>
									<User class="h-5 w-5 sm:h-6 sm:w-6" />
								</Button>
							</form>

							<div class="mx-1 h-8 w-px bg-border"></div>

							<!-- Action: Validation -->
							<form
								method="POST"
								action="?/toggleValidated"
								use:enhance={optimisticToggle(p.id, 'is_validated')}
							>
								<input type="hidden" name="id" value={p.id} />
								<input type="hidden" name="state" value={p.is_validated.toString()} />
								<Button
									type="submit"
									variant={p.is_validated ? 'default' : 'ghost'}
									size="icon"
									disabled={!p.is_present}
									class="h-10 w-10 rounded-full transition-all sm:h-12 sm:w-12 {p.is_validated
										? 'bg-green-600 hover:bg-green-700'
										: 'text-muted-foreground hover:bg-muted'}"
									aria-label={p.is_validated ? 'Invalider' : 'Valider'}
								>
									<Trophy class="h-5 w-5 sm:h-6 sm:w-6" />
								</Button>
							</form>
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		{/each}

		{#if filteredParticipations.length === 0}
			<div
				class="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
			>
				<Funnel class="mb-4 h-12 w-12 opacity-20" />
				<p class="text-lg font-medium">Aucun résultat</p>
				<p class="text-sm">Modifiez vos filtres ou votre recherche.</p>
				<Button
					variant="link"
					class="mt-2"
					onclick={() => {
						searchQuery = '';
						filterStatus = 'all';
					}}
				>
					Réinitialiser
				</Button>
			</div>
		{/if}
	</div>
</div>
