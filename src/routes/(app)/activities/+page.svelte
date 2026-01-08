<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { Plus, Cuboid } from 'lucide-svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance, delayed } = superForm(data.form, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				open = false;
			}
		}
	});

	let open = $state(false);

	// Helper pour la couleur des badges
	const difficultyColor = (diff: string) => {
		switch (diff) {
			case 'Facile':
				return 'bg-green-500/15 text-green-700 hover:bg-green-500/25';
			case 'Moyen':
				return 'bg-yellow-500/15 text-yellow-700 hover:bg-yellow-500/25';
			case 'Difficile':
				return 'bg-red-500/15 text-red-700 hover:bg-red-500/25';
			default:
				return 'bg-gray-500/15 text-gray-700';
		}
	};
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Catalogue d'Activités</h1>
			<p class="text-muted-foreground">Gérez les ateliers disponibles pour les sessions.</p>
		</div>

		<Dialog.Root bind:open>
			<Dialog.Trigger class={buttonVariants()}>
				<Plus class="mr-2 h-4 w-4" />
				Nouvelle Activité
			</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[425px]">
				<Dialog.Header>
					<Dialog.Title>Ajouter une activité</Dialog.Title>
					<Dialog.Description>
						Créez un nouvel atelier technique pour les étudiants.
					</Dialog.Description>
				</Dialog.Header>

				<form method="POST" action="?/create" use:enhance class="grid gap-4 py-4">
					<!-- Nom -->
					<div class="grid gap-2">
						<Label for="nom">Nom de l'atelier</Label>
						<Input id="nom" name="nom" bind:value={$form.nom} placeholder="Ex: Intro React" />
						{#if $errors.nom}<span class="text-sm text-destructive">{$errors.nom}</span>{/if}
					</div>

					<!-- Difficulté (Select) -->
					<div class="grid gap-2">
						<Label for="difficulte">Niveau</Label>
						<Select.Root type="single" name="difficulte" bind:value={$form.difficulte}>
							<Select.Trigger>
								{$form.difficulte ? $form.difficulte : 'Sélectionner...'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="Facile">Facile</Select.Item>
								<Select.Item value="Moyen">Moyen</Select.Item>
								<Select.Item value="Difficile">Difficile</Select.Item>
							</Select.Content>
						</Select.Root>
						<!-- Hack pour lier la valeur au form si le composant Select ne le fait pas nativement via name -->
						<input type="hidden" name="difficulte" value={$form.difficulte} />
						{#if $errors.difficulte}<span class="text-sm text-destructive"
								>{$errors.difficulte}</span
							>{/if}
					</div>

					<!-- Description -->
					<div class="grid gap-2">
						<Label for="description">Description</Label>
						<Textarea
							id="description"
							name="description"
							bind:value={$form.description}
							placeholder="Objectifs pédagogiques..."
						/>
						{#if $errors.description}<span class="text-sm text-destructive"
								>{$errors.description}</span
							>{/if}
					</div>

					<!-- Footer / Submit -->
					<Dialog.Footer>
						<button type="submit" class={buttonVariants()} disabled={$delayed}>
							{#if $delayed}Enregistrement...{:else}Créer l'activité{/if}
						</button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	</div>

	<!-- Liste des Activités -->
	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Nom</Table.Head>
					<Table.Head>Description</Table.Head>
					<Table.Head>Difficulté</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.activities as activity (activity.id)}
					<Table.Row>
						<Table.Cell class="flex items-center gap-2 font-medium">
							<Cuboid class="h-4 w-4 text-muted-foreground" />
							{activity.nom}
						</Table.Cell>
						<Table.Cell class="max-w-md truncate" title={activity.description}>
							{activity.description}
						</Table.Cell>
						<Table.Cell>
							<Badge class={difficultyColor(activity.difficulte)} variant="outline">
								{activity.difficulte}
							</Badge>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={3} class="h-24 text-center">Aucune activité trouvée.</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>
