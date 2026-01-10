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
			<h1 class="text-3xl font-bold text-epi-blue uppercase">
				Activités<span class="text-epi-teal">_</span>
			</h1>
			<p class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
				Gérez le catalogue des ateliers disponibles.
			</p>
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
					<div class="grid gap-2">
						<Label for="nom">Nom de l'atelier</Label>
						<Input id="nom" name="nom" bind:value={$form.nom} placeholder="Ex: Intro React" />
						{#if $errors.nom}<span class="text-sm text-destructive">{$errors.nom}</span>{/if}
					</div>

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
						<input type="hidden" name="difficulte" value={$form.difficulte} />
						{#if $errors.difficulte}<span class="text-sm text-destructive"
								>{$errors.difficulte}</span
							>{/if}
					</div>

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

					<Dialog.Footer>
						<button type="submit" class={buttonVariants()} disabled={$delayed}>
							{#if $delayed}Enregistrement...{:else}Créer l'activité{/if}
						</button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	</div>

	<div class="rounded-sm border bg-card shadow-sm">
		<Table.Root>
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="text-xs font-bold uppercase">Nom</Table.Head>
					<Table.Head class="text-xs font-bold uppercase">Description</Table.Head>
					<Table.Head class="text-xs font-bold uppercase">Difficulté</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.activities as activity (activity.id)}
					<Table.Row class="hover:bg-muted/30">
						<Table.Cell class="flex items-center gap-2 font-bold">
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
						<Table.Cell colspan={3} class="h-24 text-center text-muted-foreground">
							Aucune activité trouvée.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>
