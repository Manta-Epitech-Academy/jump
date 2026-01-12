<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { Plus, Funnel, Ellipsis, Pencil, Trash2, Search } from 'lucide-svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { enhance as kitEnhance } from '$app/forms';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';

	let { data }: { data: PageData } = $props();

	const { form, errors, delayed, enhance, reset } = superForm(
		untrack(() => data.form),
		{
			onResult: ({ result }) => {
				if (result.type === 'success') {
					open = false;
					toast.success(result.data?.form.message);
				} else if (result.type === 'failure') {
					toast.error(result.data?.form.message || 'Erreur de validation');
				}
			}
		}
	);

	let open = $state(false);
	let isEditing = $state(false);
	let editId = $state('');
	let searchQuery = $state('');
	let selectedLevel = $state(page.url.searchParams.get('niveau') || 'all');

	// Deletion state
	let deleteDialogOpen = $state(false);
	let studentToDelete = $state<string | null>(null);

	let filteredStudents = $derived(
		data.students.filter((student) => {
			const matchesLevel = selectedLevel === 'all' || student.niveau === selectedLevel;
			const searchLower = searchQuery.toLowerCase();
			const matchesSearch =
				student.nom.toLowerCase().includes(searchLower) ||
				student.prenom.toLowerCase().includes(searchLower);

			return matchesLevel && matchesSearch;
		})
	);

	function openCreate() {
		reset();
		isEditing = false;
		editId = '';
		open = true;
	}

	function openEdit(student: any) {
		reset();
		$form.nom = student.nom;
		$form.prenom = student.prenom;
		$form.niveau = student.niveau;

		isEditing = true;
		editId = student.id;
		open = true;
	}

	function handleFilterChange(value: string) {
		selectedLevel = value;
		const url = new URL(page.url);
		if (value && value !== 'all') {
			url.searchParams.set('niveau', value);
		} else {
			url.searchParams.delete('niveau');
		}
		replaceState(url, page.state);
	}

	function confirmDelete(id: string) {
		studentToDelete = id;
		deleteDialogOpen = true;
	}

	function formatFirstName(name: string | undefined) {
		if (!name) return '';
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}

	const niveaux = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'];
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold text-epi-blue uppercase">
				Élèves<span class="text-epi-teal">_</span>
			</h1>
			<p class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
				Annuaire et progression des étudiants du camp.
			</p>
		</div>

		<div class="flex items-center gap-2">
			<!-- Search Input -->
			<div class="relative w-full max-w-[200px]">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Rechercher..."
					class="rounded-sm bg-white pl-9"
					bind:value={searchQuery}
				/>
			</div>

			<!-- Level Filter -->
			<div class="w-[180px]">
				<Select.Root type="single" value={selectedLevel} onValueChange={handleFilterChange}>
					<Select.Trigger>
						<Funnel class="mr-2 h-4 w-4 text-muted-foreground" />
						{selectedLevel === 'all' ? 'Tous les niveaux' : selectedLevel}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">Tous les niveaux</Select.Item>
						{#each niveaux as niveau}
							<Select.Item value={niveau}>{niveau}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<button onclick={openCreate} class={buttonVariants()}>
				<Plus class="mr-2 h-4 w-4" />
				Nouvel Élève
			</button>

			<Dialog.Root bind:open>
				<Dialog.Content class="sm:max-w-[425px]">
					<Dialog.Header>
						<Dialog.Title>{isEditing ? 'Modifier' : 'Ajouter'} un élève</Dialog.Title>
						<Dialog.Description>
							{isEditing
								? 'Mettez à jour les informations du profil.'
								: "Créez le profil d'un nouvel étudiant."}
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

						<div class="grid grid-cols-2 gap-4">
							<div class="grid gap-2">
								<Label for="prenom">Prénom</Label>
								<Input id="prenom" name="prenom" bind:value={$form.prenom} placeholder="Jean" />
								{#if $errors.prenom}<span class="text-xs text-destructive">{$errors.prenom}</span
									>{/if}
							</div>
							<div class="grid gap-2">
								<Label for="nom">Nom</Label>
								<Input id="nom" name="nom" bind:value={$form.nom} placeholder="Dupont" />
								{#if $errors.nom}<span class="text-xs text-destructive">{$errors.nom}</span>{/if}
							</div>
						</div>

						<div class="grid gap-2">
							<Label for="niveau">Niveau Scolaire</Label>
							<Select.Root type="single" name="niveau" bind:value={$form.niveau}>
								<Select.Trigger>
									{$form.niveau ? $form.niveau : 'Sélectionner...'}
								</Select.Trigger>
								<Select.Content>
									{#each niveaux as niveau}
										<Select.Item value={niveau}>{niveau}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<input type="hidden" name="niveau" value={$form.niveau} />
							{#if $errors.niveau}<span class="text-xs text-destructive">{$errors.niveau}</span
								>{/if}
						</div>

						<Dialog.Footer>
							<button type="submit" class={buttonVariants()} disabled={$delayed}>
								{#if $delayed}Enregistrement...{:else}{isEditing
										? 'Mettre à jour'
										: "Créer l'élève"}{/if}
							</button>
						</Dialog.Footer>
					</form>
				</Dialog.Content>
			</Dialog.Root>

			<AlertDialog.Root bind:open={deleteDialogOpen}>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Supprimer l'élève</AlertDialog.Title>
						<AlertDialog.Description>
							Êtes-vous sûr ? Cette action est définitive.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
						{#if studentToDelete}
							<form
								action="?/delete&id={studentToDelete}"
								method="POST"
								use:kitEnhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'success') {
											toast.success('Élève supprimé');
											deleteDialogOpen = false;
											await update();
										} else {
											toast.error('Erreur lors de la suppression');
										}
									};
								}}
							>
								<AlertDialog.Action
									type="submit"
									class={buttonVariants({ variant: 'destructive' })}
								>
									Supprimer
								</AlertDialog.Action>
							</form>
						{/if}
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</div>
	</div>

	<div class="rounded-sm border bg-card shadow-sm">
		<Table.Root>
			<Table.Header class="bg-muted/50">
				<Table.Row>
					<Table.Head class="w-[300px] text-xs font-bold uppercase">Étudiant</Table.Head>
					<Table.Head class="text-xs font-bold uppercase">Niveau</Table.Head>
					<Table.Head class="text-right text-xs font-bold uppercase">XP / Événements</Table.Head>
					<Table.Head class="w-[50px]"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each filteredStudents as student (student.id)}
					<Table.Row class="hover:bg-muted/30">
						<Table.Cell class="font-bold">
							<div class="flex items-center gap-3">
								<Avatar.Root class="h-9 w-9 rounded-full border">
									<Avatar.Fallback class="bg-muted font-bold text-muted-foreground">
										{(student.prenom?.[0] ?? '').toUpperCase()}{(
											student.nom?.[0] ?? ''
										).toUpperCase()}
									</Avatar.Fallback>
								</Avatar.Root>
								<div class="flex flex-col">
									<span
										>{formatFirstName(student.prenom)}
										<span class="uppercase">{student.nom}</span></span
									>
									<span class="text-xs text-muted-foreground sm:hidden">{student.niveau}</span>
								</div>
							</div>
						</Table.Cell>
						<Table.Cell>
							<Badge variant="secondary" class="rounded-sm font-bold uppercase"
								>{student.niveau}</Badge
							>
						</Table.Cell>
						<Table.Cell class="text-right text-muted-foreground">
							<div class="flex flex-col items-end">
								<span class="font-black text-foreground">{student.xp} XP</span>
								<span class="text-[10px] font-bold tracking-widest uppercase"
									>{student.events_count} événement{student.events_count > 1 ? 's' : ''}</span
								>
							</div>
						</Table.Cell>
						<Table.Cell>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
									<Ellipsis class="h-4 w-4" />
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item onclick={() => openEdit(student)}>
										<Pencil class="mr-2 h-4 w-4" />
										Modifier
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										class="cursor-pointer text-destructive"
										onclick={() => confirmDelete(student.id)}
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
							Aucun élève trouvé.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>
