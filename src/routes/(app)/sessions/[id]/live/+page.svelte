<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { pbUrl } from '$lib/pocketbase';
	import PocketBase from 'pocketbase';
	import { ArrowLeft, User, Trophy } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import { browser } from '$app/environment';

	let { data }: { data: PageData } = $props();

	let participations = $state(data.participations);

	$effect(() => {
		participations = data.participations;
	});

	// Connection Client-side for Realtime
	const pb = new PocketBase(pbUrl);

	if (browser) {
		pb.authStore.loadFromCookie(document.cookie);
	}

	$effect(() => {
		pb.collection('participations').subscribe(
			'*',
			(e) => {
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
				} else {
					location.reload();
				}
			},
			{
				/* options */
			}
		);

		return () => {
			pb.collection('participations').unsubscribe('*');
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

			return async ({ update }: { update: () => Promise<void> }) => {
				await update();
			};
		};
	};

	let presentCount = $derived(participations.filter((p) => p.is_present).length);
	let validatedCount = $derived(participations.filter((p) => p.is_validated).length);
</script>

<div class="flex min-h-[calc(100vh-4rem)] flex-col space-y-4 pb-20">
	<!-- Top Bar Mobile -->
	<div class="sticky top-0 z-10 border-b bg-background/95 pt-2 pb-4 backdrop-blur">
		<div class="mb-2 flex items-center justify-between">
			<a
				href="/sessions/{data.session.id}/builder"
				class="flex items-center text-sm text-muted-foreground"
			>
				<ArrowLeft class="mr-1 h-4 w-4" />
				Retour Builder
			</a>
			<Badge variant={data.session.statut === 'en_cours' ? 'default' : 'outline'}>
				{data.session.statut.replace('_', ' ').toUpperCase()}
			</Badge>
		</div>

		<h1 class="truncate text-xl leading-tight font-bold">{data.session.titre}</h1>
		<p class="truncate text-sm text-muted-foreground">
			{data.session.expand?.activity?.nom}
		</p>

		<!-- Live Stats -->
		<div class="mt-4 grid grid-cols-2 gap-4">
			<div class="flex items-center justify-between rounded-lg bg-blue-50 p-2 dark:bg-blue-950/30">
				<span class="text-xs font-medium text-blue-700 dark:text-blue-300">PRÉSENTS</span>
				<span class="text-xl font-bold text-blue-800 dark:text-blue-200"
					>{presentCount}
					<span class="text-sm font-normal text-muted-foreground">/ {participations.length}</span
					></span
				>
			</div>
			<div
				class="flex items-center justify-between rounded-lg bg-green-50 p-2 dark:bg-green-950/30"
			>
				<span class="text-xs font-medium text-green-700 dark:text-green-300">VALIDÉS</span>
				<span class="text-xl font-bold text-green-800 dark:text-green-200">{validatedCount}</span>
			</div>
		</div>
	</div>

	<div class="space-y-3">
		{#each participations as p (p.id)}
			<Card.Root
				class={`border-l-4 transition-all duration-200 ${p.is_validated ? 'border-l-green-500 bg-green-50/10' : p.is_present ? 'border-l-blue-500' : 'border-l-transparent'}`}
			>
				<Card.Content class="flex items-center justify-between gap-3 p-4">
					<div class="flex flex-1 items-center gap-3 overflow-hidden">
						<Avatar.Root
							class="h-10 w-10 border-2 {p.is_present ? 'border-blue-200' : 'border-transparent'}"
						>
							<Avatar.Fallback class="font-bold">
								{p.expand?.student?.prenom?.[0] ?? '?'}{p.expand?.student?.nom?.[0] ?? '?'}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="flex min-w-0 flex-col">
							<span class="truncate font-semibold">
								{p.expand?.student?.prenom}
								{p.expand?.student?.nom}
							</span>
							<span class="text-xs text-muted-foreground">
								{p.expand?.student?.niveau}
							</span>
						</div>
					</div>

					<div class="flex items-center gap-4">
						<form
							method="POST"
							action="?/togglePresent"
							use:enhance={optimisticToggle(p.id, 'is_present')}
						>
							<input type="hidden" name="id" value={p.id} />
							<input type="hidden" name="state" value={p.is_present.toString()} />
							<button type="submit" class="group flex flex-col items-center gap-1">
								<div
									class={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${p.is_present ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-input bg-background text-muted-foreground hover:bg-accent'}`}
								>
									<User class="h-5 w-5" />
								</div>
								<span
									class="text-[10px] font-medium text-muted-foreground group-hover:text-foreground"
									>Appel</span
								>
							</button>
						</form>

						<form
							method="POST"
							action="?/toggleValidated"
							use:enhance={optimisticToggle(p.id, 'is_validated')}
						>
							<input type="hidden" name="id" value={p.id} />
							<input type="hidden" name="state" value={p.is_validated.toString()} />
							<button
								type="submit"
								class="group flex flex-col items-center gap-1 disabled:opacity-50"
								disabled={!p.is_present}
							>
								<div
									class={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${p.is_validated ? 'border-green-600 bg-green-600 text-white shadow-md' : 'border-input bg-background text-muted-foreground hover:bg-accent'}`}
								>
									<Trophy class="h-5 w-5" />
								</div>
								<span
									class="text-[10px] font-medium text-muted-foreground group-hover:text-foreground"
									>Validé</span
								>
							</button>
						</form>
					</div>
				</Card.Content>
			</Card.Root>
		{/each}

		{#if participations.length === 0}
			<div class="py-12 text-center text-muted-foreground">
				<p>Aucun participant inscrit.</p>
				<p class="text-sm">Retournez au builder pour ajouter des élèves.</p>
			</div>
		{/if}
	</div>
</div>
