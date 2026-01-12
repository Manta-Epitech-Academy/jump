<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { enhance as kitEnhance } from '$app/forms';
	import { Plus, Cuboid, Ellipsis, Pencil, Trash2, Check, Tag } from 'lucide-svelte';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { schoolLevels } from '$lib/validation/activities';
	import { cn } from '$lib/utils';
	import MultiThemeSelect from '$lib/components/MultiThemeSelect.svelte';

	let { data }: { data: PageData } = $props();

	const { form, errors, enhance, delayed, reset } = superForm(
		untrack(() => data.form),
		{
			dataType: 'json',
			onResult: ({ result }) => {
				if (result.type === 'success') {
					open = false;
					toast.success(result.data?.form.message);
				} else if (result.type === 'failure') {
					toast.error('Erreur lors de la validation');
				}
			}
		}
	);

	let open = $state(false);
	let isEditing = $state(false);
	let editId = $state('');

	function openCreate() {
		reset();
		$form.niveaux = [];
		$form.themes = [];
		isEditing = false;
		editId = '';
		open = true;
	}

	function openEdit(activity: any) {
		$form.nom = activity.nom;
		$form.description = activity.description;
		$form.niveaux = activity.niveaux || [];

		if (activity.expand && activity.expand.themes) {
			$form.themes = activity.expand.themes.map((t: any) => t.nom);
		} else {
			$form.themes = [];
		}

		isEditing = true;
		editId = activity.id;
		open = true;
	}

	function toggleLevel(level: string) {
		const lvl = level as any;
		if ($form.niveaux.includes(lvl)) {
			$form.niveaux = $form.niveaux.filter((l) => l !== lvl);
		} else {
			$form.niveaux = [...$form.niveaux, lvl];
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold text-epi-blue uppercase">
				Activités<span class="text-epi-teal">_</span>
			</h1>
			<p class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
				Catalogue des ateliers par niveaux scolaires.
			</p>
		</div>

		<Button onclick={openCreate} class="shadow-lg">
			<Plus class="mr-2 h-4 w-4" />
			Nouvelle Activité
		</Button>

		<Dialog.Root bind:open>
			<Dialog.Content class="sm:max-w-[500px]">
				<Dialog.Header>
					<Dialog.Title>{isEditing ? 'Modifier' : 'Ajouter'} une activité</Dialog.Title>
					<Dialog.Description>
						Définissez les détails, niveaux et thèmes de l'atelier.
					</Dialog.Description>
				</Dialog.Header>

				<form
					method="POST"
					action={isEditing ? '?/update' : '?/create'}
					use:enhance
					class="grid gap-4 py-4"
				>
					{#if isEditing}
						<input type="hidden" name="id" value={editId} />
					{/if}

					<div class="grid gap-2">
						<Label for="nom">Nom de l'atelier</Label>
						<Input id="nom" name="nom" bind:value={$form.nom} placeholder="Ex: Intro React" />
						{#if $errors.nom}<span class="text-sm text-destructive">{$errors.nom}</span>{/if}
					</div>

					<div class="grid gap-2">
						<Label>Thèmes</Label>
						<MultiThemeSelect themes={data.themes} bind:value={$form.themes} />
						{#if $errors.themes}<span class="text-sm text-destructive">{$errors.themes}</span>{/if}
					</div>

					<div class="grid gap-2">
						<Label>Niveaux scolaires cibles</Label>
						<div class="flex flex-wrap gap-2">
							{#each schoolLevels as level}
								{@const isActive = $form.niveaux.includes(level as any)}
								<Button
									type="button"
									variant={isActive ? 'default' : 'outline'}
									size="sm"
									onclick={() => toggleLevel(level)}
									class={cn(
										'h-7 px-2 text-[10px] font-bold uppercase transition-all',
										isActive ? 'bg-epi-blue hover:bg-epi-blue/90' : 'text-muted-foreground'
									)}
								>
									{level}
									{#if isActive}
										<Check class="ml-1 h-3 w-3" />
									{/if}
								</Button>
								{#if isActive}
									<input type="hidden" name="niveaux" value={level} />
								{/if}
							{/each}
						</div>
						{#if $errors.niveaux}<span class="text-sm text-destructive">{$errors.niveaux}</span
							>{/if}
					</div>

					<div class="grid gap-2">
						<Label for="description">Description</Label>
						<Textarea
							id="description"
							name="description"
							bind:value={$form.description}
							placeholder="Objectifs pédagogiques..."
							class="resize-none"
						/>
						{#if $errors.description}<span class="text-sm text-destructive"
								>{$errors.description}</span
							>{/if}
					</div>

					<Dialog.Footer>
						<Button type="submit" disabled={$delayed} class="w-full sm:w-auto">
							{#if $delayed}Enregistrement...{:else}{isEditing
									? 'Mettre à jour'
									: "Créer l'activité"}{/if}
						</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	</div>

	<div class="rounded-sm border bg-card shadow-sm">
		<Table.Root>
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="w-[200px] text-xs font-bold uppercase">Nom</Table.Head>
					<Table.Head class="text-xs font-bold uppercase">Thèmes & Description</Table.Head>
					<Table.Head class="w-[180px] text-xs font-bold uppercase">Niveaux</Table.Head>
					<Table.Head class="w-[50px]"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.activities as activity (activity.id)}
					<Table.Row class="hover:bg-muted/30">
						<Table.Cell class="align-top font-bold">
							<div class="flex items-center gap-2 pt-1">
								<Cuboid class="h-4 w-4 text-muted-foreground" />
								{activity.nom}
							</div>
						</Table.Cell>
						<Table.Cell class="align-top">
							<div class="flex flex-col gap-2">
								{#if activity.expand?.themes && activity.expand.themes.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each activity.expand.themes as theme}
											<Badge
												variant="outline"
												class="gap-1 border-epi-teal/50 bg-epi-teal/5 text-[10px] text-epi-teal"
											>
												<Tag class="h-2 w-2" />
												{theme.nom}
											</Badge>
										{/each}
									</div>
								{/if}
								<p
									class="max-w-md truncate text-sm text-muted-foreground"
									title={activity.description}
								>
									{activity.description}
								</p>
							</div>
						</Table.Cell>
						<Table.Cell class="pt-3 align-top">
							<div class="flex flex-wrap gap-1">
								{#each activity.niveaux as niv}
									<Badge
										variant="outline"
										class="rounded-sm border-epi-blue/30 text-[10px] text-epi-blue"
									>
										{niv}
									</Badge>
								{/each}
							</div>
						</Table.Cell>
						<Table.Cell class="pt-3 align-top">
							<DropdownMenu.Root>
								<DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
									<Ellipsis class="h-4 w-4" />
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item onclick={() => openEdit(activity)}>
										<Pencil class="mr-2 h-4 w-4" />
										Modifier
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<form
										action="?/delete&id={activity.id}"
										method="POST"
										use:kitEnhance={() => {
											return async ({ result, update }) => {
												if (result.type === 'success') {
													toast.success('Activité supprimée avec succès');
													await update();
												} else if (result.type === 'failure') {
													toast.error(result.data?.message || 'Erreur lors de la suppression');
												}
											};
										}}
									>
										<button type="submit" class="w-full">
											<DropdownMenu.Item class="cursor-pointer text-destructive">
												<Trash2 class="mr-2 h-4 w-4" />
												Supprimer
											</DropdownMenu.Item>
										</button>
									</form>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={4} class="h-24 text-center text-muted-foreground">
							Aucune activité trouvée.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>
