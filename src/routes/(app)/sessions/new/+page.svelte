<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Card from '$lib/components/ui/card';
	import { ChevronLeft, Save } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, delayed, enhance } = superForm(data.form);

	let selectedActivityName = $derived(
		data.activities.find((a) => a.id === $form.activity)?.nom || 'Sélectionner une activité'
	);
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<a href="/" class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
			<ChevronLeft class="h-4 w-4" />
		</a>
		<h1 class="text-3xl font-bold tracking-tight">Nouvelle Session</h1>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Configuration</Card.Title>
			<Card.Description>Définissez les informations générales de l'atelier.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance id="session-form" class="space-y-6">
				<div class="space-y-2">
					<Label for="titre">Titre de la session</Label>
					<Input
						id="titre"
						name="titre"
						bind:value={$form.titre}
						placeholder="Ex: Atelier Python - Groupe A"
					/>
					{#if $errors.titre}
						<p class="text-sm text-destructive">{$errors.titre}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="date">Date et Heure</Label>
					<Input
						id="date"
						name="date"
						type="datetime-local"
						bind:value={$form.date}
						class="block"
					/>
					{#if $errors.date}
						<p class="text-sm text-destructive">{$errors.date}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="activity">Activité prévue</Label>
					<Select.Root type="single" bind:value={$form.activity} name="activity">
						<Select.Trigger>
							{selectedActivityName}
						</Select.Trigger>
						<Select.Content>
							{#each data.activities as activity (activity.id)}
								<Select.Item value={activity.id}>{activity.nom}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="activity" value={$form.activity} />

					{#if $errors.activity}
						<p class="text-sm text-destructive">{$errors.activity}</p>
					{/if}
				</div>

				<input type="hidden" name="statut" value="planifiee" />
			</form>
		</Card.Content>
		<Card.Footer class="justify-end border-t bg-muted/50 px-6 py-4">
			<button type="submit" form="session-form" class={buttonVariants()} disabled={$delayed}>
				<Save class="mr-2 h-4 w-4" />
				{#if $delayed}Création...{:else}Créer et configurer les participants{/if}
			</button>
		</Card.Footer>
	</Card.Root>
</div>
