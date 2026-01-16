<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { enhance as kitEnhance } from '$app/forms';
	import {
		Plus,
		Cuboid,
		Ellipsis,
		Pencil,
		Trash2,
		Check,
		Tag,
		Link,
		ExternalLink
	} from 'lucide-svelte';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Table from '$lib/components/ui/table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { schoolLevels } from '$lib/validation/subjects';
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

	// Deletion state
	let deleteDialogOpen = $state(false);
	let subjectToDelete = $state<string | null>(null);

	function openCreate() {
		reset();
		$form.niveaux = [];
		$form.themes = [];
		$form.link = '';
		isEditing = false;
		editId = '';
		open = true;
	}

	function openEdit(subject: any) {
		$form.nom = subject.nom;
		$form.description = subject.description;
		$form.niveaux = subject.niveaux || [];
		$form.link = subject.link || '';

		if (subject.expand && subject.expand.themes) {
			$form.themes = subject.expand.themes.map((t: any) => t.nom);
		} else {
			$form.themes = [];
		}

		isEditing = true;
		editId = subject.id;
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

	function confirmDelete(id: string) {
		subjectToDelete = id;
		deleteDialogOpen = true;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold text-epi-blue uppercase">
				Sujets<span class="text-epi-teal">_</span>
			</h1>
			<p class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
				Catalogue des ateliers et sujets par niveaux scolaires.
			</p>
		</div>

		<Button onclick={openCreate} class="shadow-lg">
			<Plus class="mr-2 h-4 w-4" />
			Nouveau Sujet
		</Button>

		<Dialog.Root bind:open>
			<Dialog.Content class="sm:max-w-[500px]">
				<Dialog.Header>
					<Dialog.Title>{isEditing ? 'Modifier' : 'Ajouter'} un sujet</Dialog.Title>
					<Dialog.Description>
						Définissez les détails, niveaux et thèmes du sujet.
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
						<Label for="nom">Nom du sujet</Label>
						<Input id="nom" name="nom" bind:value={$form.nom} placeholder="Ex: Intro React" />
						{#if $errors.nom}<span class="text-sm text-destructive">{$errors.nom}</span>{/if}
					</div>

					<div class="grid gap-2">
						<Label for="link">Lien du sujet (Notion, Canvas, etc.)</Label>
						<div class="relative">
							<Link class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								id="link"
								name="link"
								bind:value={$form.link}
								class="pl-9"
								placeholder="https://..."
							/>
						</div>
						{#if $errors.link}<span class="text-sm text-destructive">{$errors.link}</span>{/if}
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
										'h-8 px-3 text-xs font-bold uppercase transition-all',
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
									: 'Créer le sujet'}{/if}
						</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>

		<AlertDialog.Root bind:open={deleteDialogOpen}>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>Supprimer le sujet</AlertDialog.Title>
					<AlertDialog.Description>
						Êtes-vous sûr de vouloir supprimer ce sujet ?
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
					{#if subjectToDelete}
						<form
							action="?/delete&id={subjectToDelete}"
							method="POST"
							use:kitEnhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										toast.success('Sujet supprimé avec succès');
										deleteDialogOpen = false;
										await update();
									} else if (result.type === 'failure') {
										toast.error(result.data?.message || 'Erreur lors de la suppression');
									}
								};
							}}
						>
							<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>
								Supprimer
							</AlertDialog.Action>
						</form>
					{/if}
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>
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
				{#each data.subjects as subject (subject.id)}
					<Table.Row class="hover:bg-muted/30">
						<Table.Cell class="align-top font-bold">
							<div class="flex flex-col gap-1 pt-1">
								<div class="flex items-center gap-2">
									<Cuboid class="h-4 w-4 text-muted-foreground" />
									{subject.nom}
								</div>
								{#if subject.link}
									<a
										href={subject.link}
										target="_blank"
										rel="noopener noreferrer"
										class="flex w-fit items-center gap-1 rounded-sm text-[10px] font-medium text-epi-blue hover:underline"
									>
										<ExternalLink class="h-3 w-3" />
										Voir le support
									</a>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="align-top">
							<div class="flex flex-col gap-2">
								{#if subject.expand?.themes && subject.expand.themes.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each subject.expand.themes as theme}
											<Badge
												variant="outline"
												class="gap-1 border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800"
											>
												<Tag class="h-2 w-2" />
												{theme.nom}
											</Badge>
										{/each}
									</div>
								{/if}
								<p
									class="max-w-md truncate text-sm text-muted-foreground"
									title={subject.description}
								>
									{subject.description}
								</p>
							</div>
						</Table.Cell>
						<Table.Cell class="pt-3 align-top">
							<div class="flex flex-wrap gap-1">
								{#each subject.niveaux as niv}
									<Badge
										variant="outline"
										class="rounded-sm border-epi-blue/20 bg-epi-blue/5 px-2 py-0.5 text-xs font-bold text-epi-blue"
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
									<DropdownMenu.Item onclick={() => openEdit(subject)}>
										<Pencil class="mr-2 h-4 w-4" />
										Modifier
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										class="cursor-pointer text-destructive"
										onclick={() => confirmDelete(subject.id)}
									>
										<Trash2 class="mr-2 h-4 w-4" />
										Supprimer
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={4} class="h-24 text-center text-muted-foreground">
							Aucun sujet trouvé.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>
