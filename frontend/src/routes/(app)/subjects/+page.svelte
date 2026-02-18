<script lang="ts">
	import type { PageData } from './$types';
	import type { SubjectsResponse, ThemesResponse, CampusesResponse } from '$lib/pocketbase-types';
	import { superForm } from 'sveltekit-superforms';
	import { enhance as kitEnhance } from '$app/forms';
	import { page } from '$app/state';

	type SubjectWithExpand = SubjectsResponse<{
		themes?: ThemesResponse[];
		campus?: CampusesResponse;
	}>;

	import {
		Plus,
		Ellipsis,
		Pencil,
		Trash2,
		Check,
		Tag,
		ExternalLink,
		School,
		Search,
		LayoutGrid,
		List,
		GraduationCap,
		X,
		Funnel,
		ArrowUpRight
	} from 'lucide-svelte';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Table from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { schoolLevels } from '$lib/validation/subjects';
	import { cn } from '$lib/utils';
	import MultiThemeSelect from '$lib/components/MultiThemeSelect.svelte';
	import { fly } from 'svelte/transition';

	let { data }: { data: PageData } = $props();

	let userCampusId = $derived(page.data.user?.campus);

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

	let sourceFilter = $state('official');
	let levelFilter = $state('all');
	let themeFilter = $state('all');
	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');

	let deleteDialogOpen = $state(false);
	let subjectToDelete = $state<string | null>(null);

	let uniqueThemes = $derived.by(() => {
		const themes = new Map<string, string>();
		data.subjects.forEach((s) => {
			const typedS = s as SubjectWithExpand;
			typedS.expand?.themes?.forEach((t) => {
				themes.set(t.id, t.nom);
			});
		});
		return Array.from(themes.entries()).sort((a, b) => a[1].localeCompare(b[1]));
	});

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

	function clearFilters() {
		levelFilter = 'all';
		themeFilter = 'all';
		searchQuery = '';
	}

	let hasActiveFilters = $derived(
		levelFilter !== 'all' || themeFilter !== 'all' || searchQuery !== ''
	);

	let filteredSubjects = $derived(
		data.subjects.filter((s) => {
			const typedS = s as SubjectWithExpand;
			if (sourceFilter === 'official' && s.campus !== '') return false;
			if (sourceFilter === 'mine' && s.campus !== userCampusId) return false;
			if (sourceFilter === 'community' && (s.campus === '' || s.campus === userCampusId))
				return false;
			if (levelFilter !== 'all' && !s.niveaux.includes(levelFilter as any)) return false;
			if (themeFilter !== 'all') {
				const hasTheme = typedS.expand?.themes?.some((t) => t.id === themeFilter);
				if (!hasTheme) return false;
			}
			if (searchQuery) {
				const query = searchQuery.toLowerCase();
				const matchesName = s.nom.toLowerCase().includes(query);
				const matchesDesc = s.description?.toLowerCase().includes(query);
				const matchesTheme = typedS.expand?.themes?.some((t) =>
					t.nom.toLowerCase().includes(query)
				);
				if (!matchesName && !matchesDesc && !matchesTheme) return false;
			}
			return true;
		})
	);

	let stats = $derived({
		total: data.subjects.length,
		official: data.subjects.filter((s) => !s.campus).length,
		mine: data.subjects.filter((s) => s.campus === userCampusId).length,
		community: data.subjects.filter((s) => s.campus && s.campus !== userCampusId).length
	});

	function getXpValue(niveaux: string[]): number {
		const map: Record<string, number> = {
			'6eme': 10,
			'5eme': 15,
			'4eme': 20,
			'3eme': 25,
			'2nde': 35,
			'1ere': 45,
			Terminale: 55,
			Sup: 70
		};
		if (!niveaux || niveaux.length === 0) return 10;
		return Math.max(...niveaux.map((l) => map[l] || 10));
	}
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
		<div>
			<h1 class="text-3xl font-bold text-epi-blue uppercase">
				Bibliothèque<span class="text-epi-teal">_</span>
			</h1>
			<p class="text-sm font-medium text-muted-foreground">
				Gérez et explorez les supports pédagogiques.
			</p>
		</div>

		<Button onclick={openCreate} class="bg-epi-blue text-white shadow-md hover:bg-epi-blue/90">
			<Plus class="mr-2 h-4 w-4" />
			Nouveau Sujet
		</Button>
	</div>

	<Tabs.Root value={sourceFilter} onValueChange={(v) => (sourceFilter = v)} class="w-full">
		<div
			class="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between md:border-b-0 md:pb-0"
		>
			<Tabs.List class="rounded-md bg-muted/50 p-1">
				<Tabs.Trigger
					value="all"
					class="rounded-sm px-3 py-1.5 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
				>
					Tous <span class="ml-2 text-[10px] text-muted-foreground">{stats.total}</span>
				</Tabs.Trigger>
				<Tabs.Trigger
					value="official"
					class="rounded-sm px-3 py-1.5 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-epi-blue data-[state=active]:shadow-sm"
				>
					Officiels <span class="ml-2 text-[10px] text-muted-foreground">{stats.official}</span>
				</Tabs.Trigger>
				<Tabs.Trigger
					value="mine"
					class="rounded-sm px-3 py-1.5 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-epi-teal data-[state=active]:shadow-sm"
				>
					Mon Campus <span class="ml-2 text-[10px] text-muted-foreground">{stats.mine}</span>
				</Tabs.Trigger>
				<Tabs.Trigger
					value="community"
					class="rounded-sm px-3 py-1.5 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:text-purple-600 data-[state=active]:shadow-sm"
				>
					Communauté <span class="ml-2 text-[10px] text-muted-foreground">{stats.community}</span>
				</Tabs.Trigger>
			</Tabs.List>

			<div class="hidden items-center gap-1 rounded-md border bg-background p-1 md:flex">
				<button
					class={cn(
						'rounded-sm p-1.5 transition-all',
						viewMode === 'grid'
							? 'bg-muted text-foreground'
							: 'text-muted-foreground hover:text-foreground'
					)}
					onclick={() => (viewMode = 'grid')}
					title="Vue Grille"
				>
					<LayoutGrid class="h-4 w-4" />
				</button>
				<button
					class={cn(
						'rounded-sm p-1.5 transition-all',
						viewMode === 'list'
							? 'bg-muted text-foreground'
							: 'text-muted-foreground hover:text-foreground'
					)}
					onclick={() => (viewMode = 'list')}
					title="Vue Liste"
				>
					<List class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
			<div class="relative flex-1">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Chercher un sujet..."
					class="h-9 w-full rounded-md border-input bg-background pl-9 md:max-w-sm"
					bind:value={searchQuery}
				/>
			</div>

			<div class="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
				<Select.Root type="single" bind:value={levelFilter}>
					<Select.Trigger class="h-9 w-32.5 text-xs">
						<GraduationCap class="mr-2 h-3.5 w-3.5 text-muted-foreground" />
						{levelFilter === 'all' ? 'Niveau' : levelFilter}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">Tous</Select.Item>
						{#each schoolLevels as level}<Select.Item value={level}>{level}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>

				<Select.Root type="single" bind:value={themeFilter}>
					<Select.Trigger class="h-9 w-37.5 text-xs">
						<Tag class="mr-2 h-3.5 w-3.5 text-muted-foreground" />
						{themeFilter === 'all'
							? 'Thème'
							: uniqueThemes.find((t) => t[0] === themeFilter)?.[1] || 'Thème'}
					</Select.Trigger>
					<Select.Content class="max-h-60">
						<Select.Item value="all">Tous</Select.Item>
						{#each uniqueThemes as [id, nom]}<Select.Item value={id}>{nom}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>

				{#if hasActiveFilters}
					<Button
						variant="ghost"
						size="sm"
						class="h-9 px-2 text-destructive hover:bg-destructive/10"
						onclick={clearFilters}><X class="h-4 w-4" /></Button
					>
				{/if}
			</div>
		</div>

		<Tabs.Content value={sourceFilter} class="mt-6 min-h-75">
			{#if filteredSubjects.length === 0}
				<div
					class="flex flex-col items-center justify-center rounded-md border border-dashed py-20 text-center"
				>
					<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
						<Funnel class="h-8 w-8 text-muted-foreground" />
					</div>
					<h3 class="text-lg font-bold">Aucun résultat</h3>
					<Button variant="link" onclick={clearFilters} class="mt-2 text-epi-blue"
						>Effacer les filtres</Button
					>
				</div>
			{:else if viewMode === 'grid'}
				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each filteredSubjects as subject, i (subject.id)}
						{@const typedSubject = subject as SubjectWithExpand}
						{@const isOfficial = !subject.campus}
						{@const isMine = subject.campus === userCampusId}
						{@const xp = getXpValue(subject.niveaux)}

						<div
							class="group relative flex flex-col rounded-md border bg-card shadow-sm transition-all hover:border-epi-blue/50 hover:shadow-md"
							style="animation-delay: {Math.min(i * 50, 300)}ms"
							in:fly={{ y: 20, duration: 300 }}
						>
							<div class="flex h-full flex-col p-5">
								<div class="mb-3 flex items-start justify-between">
									<Badge
										variant="secondary"
										class={cn(
											'font-bold',
											isOfficial
												? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
												: isMine
													? 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'
													: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200'
										)}
									>
										{isOfficial ? 'Officiel' : isMine ? 'Local' : 'Communauté'}
									</Badge>
									<span class="text-xs font-bold text-foreground/70">{xp} XP</span>
								</div>

								<h3 class="mb-2 line-clamp-2 text-lg leading-tight">{subject.nom}</h3>
								<p class="mb-4 line-clamp-3 flex-1 text-sm text-muted-foreground">
									{subject.description || 'Aucune description.'}
								</p>

								<div class="mt-auto space-y-4">
									<div class="flex flex-wrap gap-1.5">
										{#if typedSubject.expand?.themes}
											{#each typedSubject.expand.themes.slice(0, 3) as theme}
												<span
													class="rounded-sm bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground shadow-sm"
													>#{theme.nom}</span
												>
											{/each}
											{#if typedSubject.expand.themes.length > 3}
												<span class="text-[10px] font-bold text-muted-foreground"
													>+{typedSubject.expand.themes.length - 3}</span
												>
											{/if}
										{/if}
									</div>

									<div class="flex flex-wrap gap-1">
										{#each subject.niveaux as niv}
											<Badge
												variant="outline"
												class="border-foreground/30 text-[10px] font-bold text-foreground/80"
												>{niv}</Badge
											>
										{/each}
									</div>

									<Separator />

									<div class="flex items-center justify-between pt-1">
										{#if subject.link}
											<a
												href={subject.link}
												target="_blank"
												rel="noopener noreferrer"
												class="flex items-center gap-1 text-xs font-bold text-epi-blue hover:underline"
												>Support <ArrowUpRight class="h-3 w-3" /></a
											>
										{:else}
											<span class="text-xs text-muted-foreground italic">Pas de lien</span>
										{/if}

										{#if isMine}
											<div
												class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
											>
												<Button
													variant="ghost"
													size="icon"
													class="h-8 w-8 hover:text-foreground"
													onclick={() => openEdit(subject)}><Pencil class="h-3.5 w-3.5" /></Button
												>
												<Button
													variant="ghost"
													size="icon"
													class="h-8 w-8 hover:text-destructive"
													onclick={() => confirmDelete(subject.id)}
													><Trash2 class="h-3.5 w-3.5" /></Button
												>
											</div>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="rounded-md border bg-card shadow-sm">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-12.5"></Table.Head>
								<Table.Head>Sujet</Table.Head>
								<Table.Head class="hidden md:table-cell">Thèmes</Table.Head>
								<Table.Head class="hidden sm:table-cell">Niveaux</Table.Head>
								<Table.Head class="text-right">XP</Table.Head>
								<Table.Head class="w-20"></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each filteredSubjects as subject (subject.id)}
								{@const typedSubject = subject as SubjectWithExpand}
								{@const isOfficial = !subject.campus}
								{@const isMine = subject.campus === userCampusId}
								{@const xp = getXpValue(subject.niveaux)}
								<Table.Row class="group hover:bg-muted/30">
									<Table.Cell class="text-center">
										<div
											class={cn(
												'mx-auto flex h-8 w-8 items-center justify-center rounded-full shadow-sm',
												isOfficial
													? 'bg-blue-100 text-blue-700'
													: isMine
														? 'bg-teal-100 text-teal-700'
														: 'bg-purple-100 text-purple-700'
											)}
										>
											<School class="h-4 w-4" />
										</div>
									</Table.Cell>
									<Table.Cell
										><div class="flex flex-col">
											<span class="font-bold">{subject.nom}</span><span
												class="line-clamp-1 text-xs text-muted-foreground"
												>{subject.description || 'Pas de description'}</span
											>
										</div></Table.Cell
									>
									<Table.Cell class="hidden md:table-cell"
										><div class="flex flex-wrap gap-1">
											{#if typedSubject.expand?.themes}{#each typedSubject.expand.themes.slice(0, 3) as theme}<Badge
														variant="secondary"
														class="text-[10px] font-bold tracking-tight">#{theme.nom}</Badge
													>{/each}{/if}
										</div></Table.Cell
									>
									<Table.Cell class="hidden sm:table-cell"
										><div class="flex flex-wrap gap-1">
											{#each subject.niveaux as niv}<Badge
													variant="outline"
													class="border-foreground/20 font-bold">{niv}</Badge
												>{/each}
										</div></Table.Cell
									>
									<Table.Cell class="text-right font-bold text-foreground/80">{xp}</Table.Cell>
									<Table.Cell>
										<div
											class="flex justify-end opacity-0 transition-opacity group-hover:opacity-100"
										>
											{#if isMine}
												<DropdownMenu.Root>
													<DropdownMenu.Trigger
														class={buttonVariants({
															variant: 'ghost',
															size: 'icon',
															class: 'h-8 w-8'
														})}><Ellipsis class="h-4 w-4" /></DropdownMenu.Trigger
													>
													<DropdownMenu.Content align="end">
														<DropdownMenu.Item onclick={() => openEdit(subject)}
															><Pencil class="mr-2 h-4 w-4" /> Modifier</DropdownMenu.Item
														>
														<DropdownMenu.Separator />
														<DropdownMenu.Item
															class="text-destructive focus:text-destructive"
															onclick={() => confirmDelete(subject.id)}
															><Trash2 class="mr-2 h-4 w-4" /> Supprimer</DropdownMenu.Item
														>
													</DropdownMenu.Content>
												</DropdownMenu.Root>
											{:else if subject.link}
												<Button
													variant="ghost"
													size="icon"
													href={subject.link}
													target="_blank"
													class="h-8 w-8 text-epi-blue"><ExternalLink class="h-4 w-4" /></Button
												>
											{/if}
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</div>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
		<Dialog.Header
			><Dialog.Title>{isEditing ? 'Modifier le sujet' : 'Nouveau sujet'}</Dialog.Title
			></Dialog.Header
		>
		<form
			method="POST"
			action={isEditing ? '?/update' : '?/create'}
			use:enhance
			class="grid gap-5 py-4"
		>
			{#if isEditing}<input type="hidden" name="id" value={editId} />{/if}
			<div class="grid gap-2">
				<Label for="nom">Nom</Label><Input
					id="nom"
					name="nom"
					bind:value={$form.nom}
					placeholder="Ex: Master Class Python"
					class="font-medium"
				/>
			</div>
			<div class="grid gap-2">
				<Label for="link">Support (URL)</Label><Input
					id="link"
					name="link"
					bind:value={$form.link}
					placeholder="https://..."
				/>
			</div>
			<div class="grid gap-2">
				<Label>Thèmes</Label><MultiThemeSelect themes={data.themes} bind:value={$form.themes} />
			</div>
			<div class="grid gap-3 rounded-md border bg-muted/20 p-4">
				<Label>Niveaux cibles</Label>
				<div class="flex flex-wrap gap-2">
					{#each schoolLevels as level}
						{@const isActive = $form.niveaux.includes(level as any)}
						<Button
							type="button"
							variant={isActive ? 'default' : 'outline'}
							size="sm"
							onclick={() => toggleLevel(level)}
							class={cn(
								'h-8 text-xs transition-all',
								isActive ? 'bg-epi-blue hover:bg-epi-blue/90' : 'text-muted-foreground'
							)}
							>{level}{#if isActive}<Check class="ml-1.5 h-3 w-3" />{/if}</Button
						>
						{#if isActive}<input type="hidden" name="niveaux" value={level} />{/if}
					{/each}
				</div>
			</div>
			<div class="grid gap-2">
				<Label for="description">Description</Label><Textarea
					id="description"
					name="description"
					bind:value={$form.description}
					placeholder="Objectifs..."
					class="min-h-32 resize-none"
				/>
			</div>
			<Dialog.Footer class="gap-2 pt-2"
				><Button type="button" variant="ghost" onclick={() => (open = false)}>Annuler</Button
				><Button type="submit" disabled={$delayed} class="bg-epi-blue text-white"
					>{$delayed ? 'Traitement...' : isEditing ? 'Mettre à jour' : 'Créer'}</Button
				></Dialog.Footer
			>
		</form>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content
		><AlertDialog.Header
			><AlertDialog.Title>Suppression définitive</AlertDialog.Title></AlertDialog.Header
		>
		<AlertDialog.Footer
			><AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
			{#if subjectToDelete}
				<form
					action="?/delete&id={subjectToDelete}"
					method="POST"
					use:kitEnhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								toast.success('Supprimé');
								deleteDialogOpen = false;
								await update();
							}
						};
					}}
				>
					<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}
						>Supprimer</AlertDialog.Action
					>
				</form>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
