<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import {
		Plus,
		Funnel,
		Ellipsis,
		Pencil,
		Trash2,
		Search,
		Eye,
		Users,
		SignalLow,
		SignalMedium,
		SignalHigh
	} from 'lucide-svelte';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils';
	import { difficultes } from '$lib/validation/students';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';

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
		$form.niveau_difficulte = 'Débutant';
		isEditing = false;
		editId = '';
		open = true;
	}

	function openEdit(student: any) {
		reset();
		$form.nom = student.nom;
		$form.prenom = student.prenom;
		$form.email = student.email || '';
		$form.phone = student.phone || '';
		$form.parent_email = student.parent_email || '';
		$form.parent_phone = student.parent_phone || '';
		$form.niveau = student.niveau;
		$form.niveau_difficulte = student.niveau_difficulte || 'Débutant';

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

	function getDifficultyColor(diff: string) {
		switch (diff) {
			case 'Débutant':
				return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400';
			case 'Intermédiaire':
				return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400';
			case 'Avancé':
				return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400';
			default:
				return 'border-border text-muted-foreground';
		}
	}

	const niveaux = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'];
</script>

<div class="space-y-6">
	<PageHeader title="Élèves" subtitle="Annuaire et progression des étudiants du camp.">
		<Button onclick={openCreate}>
			<Plus class="mr-2 h-4 w-4" />
			Nouvel Élève
		</Button>
	</PageHeader>

	<div class="flex items-center gap-2">
		<!-- Search Input -->
		<div class="relative w-full max-w-50">
			<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
			<Input
				placeholder="Rechercher..."
				class="rounded-sm bg-white pl-9"
				bind:value={searchQuery}
			/>
		</div>

		<!-- Level Filter -->
		<div class="w-45">
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

		<Dialog.Root bind:open>
			<Dialog.Content class="sm:max-w-125">
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
							<Label for="nom">Nom</Label>
							<Input id="nom" name="nom" bind:value={$form.nom} placeholder="Dupont" />
							{#if $errors.nom}<span class="text-xs text-destructive">{$errors.nom}</span>{/if}
						</div>
						<div class="grid gap-2">
							<Label for="prenom">Prénom</Label>
							<Input id="prenom" name="prenom" bind:value={$form.prenom} placeholder="Jean" />
							{#if $errors.prenom}<span class="text-xs text-destructive">{$errors.prenom}</span
								>{/if}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div class="grid gap-2">
							<Label for="email">Email (Optionnel)</Label>
							<Input
								id="email"
								name="email"
								type="email"
								bind:value={$form.email}
								placeholder="email@example.com"
							/>
							{#if $errors.email}<span class="text-xs text-destructive">{$errors.email}</span>{/if}
						</div>
						<div class="grid gap-2">
							<Label for="phone">Téléphone (Optionnel)</Label>
							<Input
								id="phone"
								name="phone"
								type="tel"
								bind:value={$form.phone}
								placeholder="06..."
							/>
							{#if $errors.phone}<span class="text-xs text-destructive">{$errors.phone}</span>{/if}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div class="grid gap-2">
							<Label for="parent_email">Email Parent (Optionnel)</Label>
							<Input
								id="parent_email"
								name="parent_email"
								type="email"
								bind:value={$form.parent_email}
								placeholder="parent@example.com"
							/>
							{#if $errors.parent_email}<span class="text-xs text-destructive"
									>{$errors.parent_email}</span
								>{/if}
						</div>
						<div class="grid gap-2">
							<Label for="parent_phone">Téléphone Parent (Optionnel)</Label>
							<Input
								id="parent_phone"
								name="parent_phone"
								type="tel"
								bind:value={$form.parent_phone}
								placeholder="06..."
							/>
							{#if $errors.parent_phone}<span class="text-xs text-destructive"
									>{$errors.parent_phone}</span
								>{/if}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
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

						<div class="grid gap-2">
							<Label for="niveau_difficulte">Difficulté</Label>
							<Select.Root
								type="single"
								name="niveau_difficulte"
								bind:value={$form.niveau_difficulte}
							>
								<Select.Trigger>
									{$form.niveau_difficulte ? $form.niveau_difficulte : 'Débutant'}
								</Select.Trigger>
								<Select.Content>
									{#each difficultes as diff}
										<Select.Item value={diff}>{diff}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<input type="hidden" name="niveau_difficulte" value={$form.niveau_difficulte} />
							{#if $errors.niveau_difficulte}<span class="text-xs text-destructive"
									>{$errors.niveau_difficulte}</span
								>{/if}
						</div>
					</div>

					<Dialog.Footer>
						<Button type="submit" disabled={$delayed}>
							{#if $delayed}Enregistrement...{:else}{isEditing
									? 'Mettre à jour'
									: "Créer l'élève"}{/if}
						</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>

		<ConfirmDeleteDialog
			bind:open={deleteDialogOpen}
			action="?/delete&id={studentToDelete}"
			title="Supprimer l'élève"
			description="Êtes-vous sûr ? Cette action est définitive."
			buttonText="Supprimer"
		/>
	</div>

	{#if filteredStudents.length > 0}
		<div class="rounded-sm border bg-card shadow-sm">
			<Table.Root>
				<Table.Header class="bg-muted/50">
					<Table.Row>
						<Table.Head class="w-60 text-xs font-bold uppercase">Étudiant</Table.Head>
						<Table.Head class="text-xs font-bold uppercase">Niveau</Table.Head>
						<Table.Head class="hidden text-xs font-bold uppercase sm:table-cell"
							>Difficulté</Table.Head
						>
						<Table.Head class="text-right text-xs font-bold uppercase">XP / Événements</Table.Head>
						<Table.Head class="w-12.5"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each filteredStudents as student (student.id)}
						{@const diff = student.niveau_difficulte || 'Débutant'}
						<Table.Row class="hover:bg-muted/30">
							<Table.Cell class="font-bold">
								<a href={resolve(`/students/${student.id}`)} class="group block">
									<StudentAvatarItem {student} showBadge={false} />
								</a>
							</Table.Cell>
							<Table.Cell>
								<Badge
									variant="secondary"
									class="rounded-sm bg-epi-blue/5 px-2 py-0 text-[10px] font-bold text-epi-blue uppercase"
								>
									{student.niveau}
								</Badge>
							</Table.Cell>
							<Table.Cell class="hidden sm:table-cell">
								<Badge
									variant="outline"
									class={cn('text-[9px] font-bold uppercase', getDifficultyColor(diff))}
								>
									{#if diff === 'Débutant'}
										<SignalLow class="mr-1 h-3 w-3" />
									{:else if diff === 'Intermédiaire'}
										<SignalMedium class="mr-1 h-3 w-3" />
									{:else}
										<SignalHigh class="mr-1 h-3 w-3" />
									{/if}
									{diff}
								</Badge>
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
										<a
											href={resolve(`/students/${student.id}`)}
											class="relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
										>
											<Eye class="mr-2 h-4 w-4 text-epi-blue" />
											Voir le dossier
										</a>
										<DropdownMenu.Separator />
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
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{:else}
		<EmptyState
			icon={Users}
			title="Salle de classe vide"
			description="Aucun élève ne correspond à cette recherche.<br/>Ils sont peut-être partis à la cafétéria ?"
			actionLabel="Ajouter un élève"
			actionCallback={openCreate}
		/>
	{/if}
</div>
