<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { MapPin, ArrowRight } from 'lucide-svelte';

	let { data } = $props();
	let selectedCampusId = $state('');

	let selectedCampusName = $derived(
		data.campuses.find((c) => c.id === selectedCampusId)?.name || 'Sélectionner une ville'
	);
</script>

<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4">
	<div
		class="absolute inset-0 z-0 bg-background opacity-50"
		style="background-image: radial-gradient(var(--epi-blue) 1px, transparent 1px); background-size: 32px 32px; opacity: 0.05;"
	></div>

	<Card.Root class="z-10 w-full max-w-md border-t-4 border-t-epi-blue shadow-2xl">
		<Card.Header class="text-center">
			<div
				class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-epi-blue/10 text-epi-blue"
			>
				<MapPin class="h-7 w-7" />
			</div>
			<Card.Title class="font-heading text-2xl uppercase">Bienvenue !</Card.Title>
			<Card.Description>
				Pour finaliser votre inscription, veuillez sélectionner votre campus Epitech de
				rattachement.
			</Card.Description>
		</Card.Header>

		<Card.Content>
			<form method="POST" action="?/joinCampus" use:enhance class="space-y-6">
				<div class="space-y-2">
					<Select.Root type="single" bind:value={selectedCampusId}>
						<!-- Added w-full to fill the card and justify-center for the text -->
						<Select.Trigger class="flex h-12 w-full items-center justify-center text-base">
							{selectedCampusName}
						</Select.Trigger>

						<!-- Added w-[var(--bits-select-anchor-width)] to ensure the dropdown matches the button width -->
						<Select.Content class="max-h-60 w-[var(--bits-select-anchor-width)] overflow-y-auto">
							{#each data.campuses as campus}
								<Select.Item value={campus.id} class="flex justify-center text-base">
									{campus.name}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="campusId" value={selectedCampusId} />
				</div>

				<Button type="submit" class="w-full" size="lg" disabled={!selectedCampusId}>
					Valider et Accéder
					<ArrowRight class="ml-2 h-4 w-4" />
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
