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
		Cuboid,
		Ellipsis,
		Pencil,
		Trash2,
		Check,
		Tag,
		Link,
		ExternalLink,
		School,
		MapPin,
		Globe,
		Funnel,
		Share2,
		Search,
		LayoutGrid,
		List,
		Sparkles,
		BookOpen,
		GraduationCap,
		X
	} from 'lucide-svelte';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Select from '$lib/components/ui/select';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { schoolLevels } from '$lib/validation/subjects';
	import { cn } from '$lib/utils';
	import MultiThemeSelect from '$lib/components/MultiThemeSelect.svelte';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';

	let { data }: { data: PageData } = $props();

	// Get current user campus from layout data
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

	// Filters
	let sourceFilter = $state('official'); // Default to official
	let levelFilter = $state('all');
	let themeFilter = $state('all');
	let searchQuery = $state('');
	let viewMode = $state<'grid' | 'list'>('grid');

	let deleteDialogOpen = $state(false);
	let subjectToDelete = $state<string | null>(null);

	// Get unique themes for filter
	let uniqueThemes = $derived.by(() => {
		const themes = new Map<string, string>();
		data.subjects.forEach((s) => {
			const typedS = s as SubjectWithExpand;
			typedS.expand?.themes?.forEach((t) => {
				themes.set(t.id, t.nom);
			});
		});
		return Array.from(themes.entries());
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
		// We don't reset sourceFilter here to keep the user on the current tab
		levelFilter = 'all';
		themeFilter = 'all';
		searchQuery = '';
	}

	// Active filters only tracks search, level and theme (Source is a top-level tab)
	let hasActiveFilters = $derived(
		levelFilter !== 'all' || themeFilter !== 'all' || searchQuery !== ''
	);

	// Filter Logic
	let filteredSubjects = $derived(
		data.subjects.filter((s) => {
			const typedS = s as SubjectWithExpand;

			// Source filter
			if (sourceFilter === 'official' && s.campus !== '') return false;
			if (sourceFilter === 'mine' && s.campus !== userCampusId) return false;
			if (sourceFilter === 'community' && (s.campus === '' || s.campus === userCampusId))
				return false;

			// Level filter
			if (levelFilter !== 'all' && !s.niveaux.includes(levelFilter as any)) return false;

			// Theme filter
			if (themeFilter !== 'all') {
				const hasTheme = typedS.expand?.themes?.some((t) => t.id === themeFilter);
				if (!hasTheme) return false;
			}

			// Search filter
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

	// Stats
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
	<!-- Header Section -->
	<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<h1 class="text-3xl font-bold text-epi-blue uppercase">
				Bibliothèque des Sujets<span class="text-epi-teal">_</span>
			</h1>
			<p class="mt-1 text-sm font-bold tracking-wider text-muted-foreground uppercase">
				Explorez et gérez le catalogue pédagogique
			</p>
		</div>

		<!-- Quick Stats -->
		<div class="flex flex-wrap gap-2">
			<button
				class={cn(
					'flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-bold transition-all',
					sourceFilter === 'all'
						? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
						: 'border-border bg-card hover:border-epi-blue/50'
				)}
				onclick={() => (sourceFilter = 'all')}
			>
				<Cuboid class="h-3.5 w-3.5" />
				<span>Tous</span>
				<Badge variant="secondary" class="ml-1 h-5 px-1.5 text-[10px]">{stats.total}</Badge>
			</button>

			<button
				class={cn(
					'flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-bold transition-all',
					sourceFilter === 'official'
						? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
						: 'border-border bg-card hover:border-epi-blue/50'
				)}
				onclick={() => (sourceFilter = 'official')}
			>
				<School class="h-3.5 w-3.5" />
				<span>Officiels</span>
				<Badge variant="secondary" class="ml-1 h-5 px-1.5 text-[10px]">{stats.official}</Badge>
			</button>

			<button
				class={cn(
					'flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-bold transition-all',
					sourceFilter === 'mine'
						? 'border-epi-teal bg-epi-teal/10 text-teal-700 dark:text-teal-400'
						: 'border-border bg-card hover:border-epi-teal/50'
				)}
				onclick={() => (sourceFilter = 'mine')}
			>
				<MapPin class="h-3.5 w-3.5" />
				<span>Mon Campus</span>
				<Badge variant="secondary" class="ml-1 h-5 px-1.5 text-[10px]">{stats.mine}</Badge>
			</button>

			<button
				class={cn(
					'flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-bold transition-all',
					sourceFilter === 'community'
						? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-400'
						: 'border-border bg-card hover:border-purple-500/50'
				)}
				onclick={() => (sourceFilter = 'community')}
			>
				<Globe class="h-3.5 w-3.5" />
				<span>Communauté</span>
				<Badge variant="secondary" class="ml-1 h-5 px-1.5 text-[10px]">{stats.community}</Badge>
			</button>
		</div>
	</div>

	<!-- Filters Bar -->
	<div class="flex flex-col gap-4 rounded-sm border bg-card p-4 shadow-sm">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
			<!-- Search -->
			<div class="relative flex-1 lg:max-w-sm">
				<Search class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Rechercher un sujet, thème..."
					class="bg-background pl-9"
					bind:value={searchQuery}
				/>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<!-- Level Filter -->
				<Select.Root type="single" bind:value={levelFilter}>
					<Select.Trigger class="h-9 w-35 text-xs">
						<GraduationCap class="mr-2 h-3.5 w-3.5" />
						{levelFilter === 'all' ? 'Niveau' : levelFilter}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">Tous les niveaux</Select.Item>
						{#each schoolLevels as level}
							<Select.Item value={level}>{level}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<!-- Theme Filter -->
				<Select.Root type="single" bind:value={themeFilter}>
					<Select.Trigger class="h-9 w-40 text-xs">
						<Tag class="mr-2 h-3.5 w-3.5" />
						{themeFilter === 'all'
							? 'Thème'
							: uniqueThemes.find((t) => t[0] === themeFilter)?.[1] || 'Thème'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all">Tous les thèmes</Select.Item>
						{#each uniqueThemes as [id, nom]}
							<Select.Item value={id}>{nom}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				{#if hasActiveFilters}
					<Button variant="ghost" size="sm" class="h-9 text-xs" onclick={clearFilters}>
						<X class="mr-1 h-3 w-3" />
						Réinitialiser
					</Button>
				{/if}

				<Separator orientation="vertical" class="mx-2 hidden h-6 lg:block" />

				<!-- View Toggle -->
				<div class="flex rounded-sm border bg-background p-0.5">
					<button
						class={cn(
							'rounded-xs p-1.5 transition-all',
							viewMode === 'grid'
								? 'bg-muted text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						)}
						onclick={() => (viewMode = 'grid')}
						title="Vue Grille"
					>
						<LayoutGrid class="h-4 w-4" />
					</button>
					<button
						class={cn(
							'rounded-xs p-1.5 transition-all',
							viewMode === 'list'
								? 'bg-muted text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'
						)}
						onclick={() => (viewMode = 'list')}
						title="Vue Liste"
					>
						<List class="h-4 w-4" />
					</button>
				</div>

				<Button onclick={openCreate} class="shadow-md">
					<Plus class="mr-2 h-4 w-4" />
					Nouveau Sujet
				</Button>
			</div>
		</div>

		<!-- Active Filters Display -->
		{#if hasActiveFilters}
			<div class="flex flex-wrap items-center gap-2 border-t pt-3">
				<span class="text-[10px] font-bold text-muted-foreground uppercase">Filtres actifs:</span>
				{#if levelFilter !== 'all'}
					<Badge variant="secondary" class="gap-1 text-xs">
						<GraduationCap class="h-3 w-3" />
						{levelFilter}
						<button
							class="ml-1 hover:text-destructive"
							onclick={() => (levelFilter = 'all')}
							aria-label="Retirer le filtre niveau"
						>
							<X class="h-3 w-3" />
						</button>
					</Badge>
				{/if}
				{#if themeFilter !== 'all'}
					<Badge variant="secondary" class="gap-1 text-xs">
						<Tag class="h-3 w-3" />
						{uniqueThemes.find((t) => t[0] === themeFilter)?.[1]}
						<button
							class="ml-1 hover:text-destructive"
							onclick={() => (themeFilter = 'all')}
							aria-label="Retirer le filtre thème"
						>
							<X class="h-3 w-3" />
						</button>
					</Badge>
				{/if}
				{#if searchQuery}
					<Badge variant="secondary" class="gap-1 text-xs">
						<Search class="h-3 w-3" />
						"{searchQuery}"
						<button
							class="ml-1 hover:text-destructive"
							onclick={() => (searchQuery = '')}
							aria-label="Retirer la recherche"
						>
							<X class="h-3 w-3" />
						</button>
					</Badge>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Results Count -->
	<div class="flex items-center justify-between">
		<p class="text-sm text-muted-foreground">
			<span class="font-bold text-foreground">{filteredSubjects.length}</span>
			sujet{filteredSubjects.length > 1 ? 's' : ''} trouvé{filteredSubjects.length > 1 ? 's' : ''}
		</p>
	</div>

	<!-- Content Grid/List -->
	{#if viewMode === 'grid'}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredSubjects as subject, i (subject.id)}
				{@const typedSubject = subject as SubjectWithExpand}
				{@const isOfficial = !subject.campus}
				{@const isMine = subject.campus === userCampusId}
				{@const xp = getXpValue(subject.niveaux)}

				<div
					class="subject-card"
					style="animation-delay: {Math.min(i * 50, 300)}ms"
					out:fly={{ y: 20, duration: 200 }}
				>
					<Card.Root
						class={cn(
							'group relative h-full overflow-hidden border-l-4 transition-all hover:shadow-lg',
							isOfficial
								? 'border-l-epi-blue'
								: isMine
									? 'border-l-epi-teal'
									: 'border-l-purple-500'
						)}
					>
						<!-- XP Badge -->
						<div class="absolute top-3 right-3">
							<Badge
								class="bg-linear-to-r from-epi-orange to-orange-400 font-mono text-xs font-bold text-white shadow-sm"
							>
								{xp} XP
							</Badge>
						</div>

						<Card.Header class="pb-2">
							<!-- Source Badge -->
							<div class="mb-2">
								{#if isOfficial}
									<Badge class="gap-1 bg-epi-blue text-[9px] uppercase hover:bg-epi-blue/90">
										<School class="h-3 w-3" /> Officiel
									</Badge>
								{:else if isMine}
									<Badge
										variant="outline"
										class="gap-1 border-epi-teal bg-epi-teal/10 text-[9px] text-teal-800 uppercase dark:text-teal-400"
									>
										<MapPin class="h-3 w-3" /> Mon Campus
									</Badge>
								{:else}
									<Badge
										variant="outline"
										class="gap-1 border-purple-200 bg-purple-50 text-[9px] text-purple-800 uppercase dark:border-purple-900 dark:bg-purple-900/30 dark:text-purple-300"
									>
										<Globe class="h-3 w-3" />
										{typedSubject.expand?.campus?.name || 'Communauté'}
									</Badge>
								{/if}
							</div>

							<Card.Title class="flex items-start gap-2 text-base leading-tight">
								<BookOpen class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
								<span class="line-clamp-2">{subject.nom}</span>
							</Card.Title>
						</Card.Header>

						<Card.Content class="space-y-3">
							<!-- Themes -->
							{#if typedSubject.expand?.themes && typedSubject.expand.themes.length > 0}
								<div class="flex flex-wrap gap-1">
									{#each typedSubject.expand.themes.slice(0, 3) as theme}
										{@const isThemeOfficial = !theme.campus}
										{@const isThemeMine = theme.campus === userCampusId}

										<Badge
											variant="outline"
											class={cn(
												'gap-1 px-1.5 py-0 text-[10px]',
												isThemeOfficial
													? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-900/30 dark:text-purple-300'
													: isThemeMine
														? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-900/30 dark:text-teal-300'
														: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-900/30 dark:text-orange-300'
											)}
										>
											{#if isThemeOfficial}
												<Globe class="h-2 w-2" />
											{:else if isThemeMine}
												<Tag class="h-2 w-2" />
											{:else}
												<Share2 class="h-2 w-2" />
											{/if}
											{theme.nom}
										</Badge>
									{/each}
									{#if typedSubject.expand.themes.length > 3}
										<Badge variant="outline" class="px-1.5 py-0 text-[10px]">
											+{typedSubject.expand.themes.length - 3}
										</Badge>
									{/if}
								</div>
							{/if}

							<!-- Description -->
							<p class="line-clamp-2 text-xs text-muted-foreground">
								{subject.description || 'Aucune description disponible.'}
							</p>

							<!-- Levels -->
							<div class="flex flex-wrap gap-1">
								{#each subject.niveaux as niv}
									<span
										class="rounded-xs border border-epi-blue/20 bg-epi-blue/5 px-1.5 py-0.5 text-[10px] font-bold text-epi-blue"
									>
										{niv}
									</span>
								{/each}
							</div>
						</Card.Content>

						<Card.Footer class="flex items-center justify-between border-t bg-muted/30 px-4 py-2">
							{#if subject.link}
								<a
									href={subject.link}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-1 text-[11px] font-bold text-epi-blue hover:underline"
								>
									<ExternalLink class="h-3 w-3" />
									Voir le support
								</a>
							{:else}
								<span class="text-[11px] text-muted-foreground italic">Pas de lien</span>
							{/if}

							{#if isMine}
								<DropdownMenu.Root>
									<DropdownMenu.Trigger
										class={buttonVariants({
											variant: 'ghost',
											size: 'icon',
											class: 'h-7 w-7'
										})}
									>
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
							{/if}
						</Card.Footer>
					</Card.Root>
				</div>
			{:else}
				<div class="col-span-full flex flex-col items-center justify-center py-20 text-center">
					<div class="mb-4 rounded-full bg-muted p-4">
						<Cuboid class="h-8 w-8 text-muted-foreground" />
					</div>
					<h3 class="text-lg font-bold uppercase">Aucun sujet trouvé</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						Essayez de modifier vos critères de recherche.
					</p>
					{#if hasActiveFilters}
						<Button variant="outline" class="mt-4" onclick={clearFilters}>
							Réinitialiser les filtres
						</Button>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<!-- List View -->
		<div class="rounded-sm border bg-card shadow-sm">
			<div class="divide-y">
				{#each filteredSubjects as subject, i (subject.id)}
					{@const typedSubject = subject as SubjectWithExpand}
					{@const isOfficial = !subject.campus}
					{@const isMine = subject.campus === userCampusId}
					{@const xp = getXpValue(subject.niveaux)}

					<div
						class="flex items-center gap-4 p-4 transition-colors hover:bg-muted/30"
						in:fly={{ y: 10, duration: 200, delay: Math.min(i * 30, 200) }}
					>
						<!-- Type Indicator -->
						<div
							class={cn(
								'h-10 w-1 shrink-0 rounded-full',
								isOfficial ? 'bg-epi-blue' : isMine ? 'bg-epi-teal' : 'bg-purple-500'
							)}
						></div>

						<!-- Main Content -->
						<div class="min-w-0 flex-1">
							<div class="flex items-start gap-2">
								<h3 class="font-bold">{subject.nom}</h3>
								{#if isOfficial}
									<Badge class="h-5 gap-1 bg-epi-blue text-[9px] uppercase">
										<School class="h-2.5 w-2.5" /> Officiel
									</Badge>
								{:else if isMine}
									<Badge
										variant="outline"
										class="h-5 gap-1 border-epi-teal bg-epi-teal/10 text-[9px] text-teal-800 uppercase dark:text-teal-400"
									>
										<MapPin class="h-2.5 w-2.5" /> Local
									</Badge>
								{:else}
									<Badge
										variant="outline"
										class="h-5 gap-1 border-purple-200 bg-purple-50 text-[9px] text-purple-800 uppercase dark:border-purple-900 dark:bg-purple-900/30 dark:text-purple-300"
									>
										<Globe class="h-2.5 w-2.5" />
										{typedSubject.expand?.campus?.name || 'Communauté'}
									</Badge>
								{/if}
							</div>

							<p class="mt-1 line-clamp-1 text-sm text-muted-foreground">
								{subject.description || 'Aucune description'}
							</p>

							<div class="mt-2 flex flex-wrap items-center gap-2">
								{#if typedSubject.expand?.themes}
									{#each typedSubject.expand.themes.slice(0, 2) as theme}
										<span class="text-[10px] font-bold text-muted-foreground uppercase">
											#{theme.nom}
										</span>
									{/each}
								{/if}
							</div>
						</div>

						<!-- Levels -->
						<div class="hidden flex-wrap justify-end gap-1 sm:flex sm:w-40">
							{#each subject.niveaux as niv}
								<Badge
									variant="outline"
									class="border-epi-blue/20 bg-epi-blue/5 px-2 py-0.5 text-[10px] font-bold text-epi-blue"
								>
									{niv}
								</Badge>
							{/each}
						</div>

						<!-- XP -->
						<Badge
							class="shrink-0 bg-linear-to-r from-epi-orange to-orange-400 font-mono text-xs font-bold text-white"
						>
							{xp} XP
						</Badge>

						<!-- Link -->
						<div class="hidden w-24 shrink-0 lg:block">
							{#if subject.link}
								<a
									href={subject.link}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-1 text-[11px] font-bold text-epi-blue hover:underline"
								>
									<ExternalLink class="h-3 w-3" />
									Support
								</a>
							{:else}
								<span class="text-[11px] text-muted-foreground italic">—</span>
							{/if}
						</div>

						<!-- Actions -->
						{#if isMine}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									class={buttonVariants({ variant: 'ghost', size: 'icon', class: 'h-8 w-8' })}
								>
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
						{:else}
							<div class="w-8"></div>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-20 text-center">
						<div class="mb-4 rounded-full bg-muted p-4">
							<Cuboid class="h-8 w-8 text-muted-foreground" />
						</div>
						<h3 class="text-lg font-bold uppercase">Aucun sujet trouvé</h3>
						<p class="mt-1 text-sm text-muted-foreground">
							Essayez de modifier vos critères de recherche.
						</p>
						{#if hasActiveFilters}
							<Button variant="outline" class="mt-4" onclick={clearFilters}>
								Réinitialiser les filtres
							</Button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- Create/Edit Dialog -->
<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				{#if isEditing}
					<Pencil class="h-5 w-5 text-epi-blue" />
					Modifier le sujet
				{:else}
					<Plus class="h-5 w-5 text-epi-teal" />
					Créer un nouveau sujet
				{/if}
			</Dialog.Title>
			<Dialog.Description>
				{isEditing
					? 'Mettez à jour les informations du sujet.'
					: 'Définissez les détails, niveaux et thèmes du nouveau sujet.'}
			</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action={isEditing ? '?/update' : '?/create'}
			use:enhance
			class="grid gap-5 py-4"
		>
			{#if isEditing}
				<input type="hidden" name="id" value={editId} />
			{/if}

			<div class="grid gap-2">
				<Label for="nom" class="flex items-center gap-2">
					<BookOpen class="h-4 w-4 text-muted-foreground" />
					Nom du sujet
				</Label>
				<Input id="nom" name="nom" bind:value={$form.nom} placeholder="Ex: Introduction à React" />
				{#if $errors.nom}<span class="text-sm text-destructive">{$errors.nom}</span>{/if}
			</div>

			<div class="grid gap-2">
				<Label for="link" class="flex items-center gap-2">
					<Link class="h-4 w-4 text-muted-foreground" />
					Lien du support (Notion, Canvas, etc.)
				</Label>
				<Input id="link" name="link" bind:value={$form.link} placeholder="https://..." />
				{#if $errors.link}<span class="text-sm text-destructive">{$errors.link}</span>{/if}
			</div>

			<div class="grid gap-2">
				<Label class="flex items-center gap-2">
					<Tag class="h-4 w-4 text-muted-foreground" />
					Thèmes
				</Label>
				<MultiThemeSelect themes={data.themes} bind:value={$form.themes} />
				{#if $errors.themes}<span class="text-sm text-destructive">{$errors.themes}</span>{/if}
			</div>

			<div class="grid gap-3">
				<Label class="flex items-center gap-2">
					<GraduationCap class="h-4 w-4 text-muted-foreground" />
					Niveaux scolaires cibles
				</Label>
				<div class="flex flex-wrap gap-2">
					{#each schoolLevels as level}
						{@const isActive = $form.niveaux.includes(level as any)}
						<Button
							type="button"
							variant={isActive ? 'default' : 'outline'}
							size="sm"
							onclick={() => toggleLevel(level)}
							class={cn(
								'h-9 px-3 text-xs font-bold uppercase transition-all',
								isActive
									? 'bg-epi-blue shadow-md hover:bg-epi-blue/90'
									: 'text-muted-foreground hover:border-epi-blue hover:text-epi-blue'
							)}
						>
							{level}
							{#if isActive}
								<Check class="ml-1.5 h-3.5 w-3.5" />
							{/if}
						</Button>
						{#if isActive}
							<input type="hidden" name="niveaux" value={level} />
						{/if}
					{/each}
				</div>
				{#if $errors.niveaux}<span class="text-sm text-destructive">{$errors.niveaux}</span>{/if}
			</div>

			<div class="grid gap-2">
				<Label for="description" class="flex items-center gap-2">
					<Sparkles class="h-4 w-4 text-muted-foreground" />
					Description
				</Label>
				<Textarea
					id="description"
					name="description"
					bind:value={$form.description}
					placeholder="Décrivez les objectifs pédagogiques, les compétences visées..."
					class="min-h-24 resize-none"
				/>
				{#if $errors.description}<span class="text-sm text-destructive">{$errors.description}</span
					>{/if}
			</div>

			<Dialog.Footer class="gap-2 pt-2">
				<Button type="button" variant="outline" onclick={() => (open = false)}>Annuler</Button>
				<Button type="submit" disabled={$delayed}>
					{#if $delayed}
						Enregistrement...
					{:else if isEditing}
						Mettre à jour
					{:else}
						Créer le sujet
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Supprimer le sujet ?</AlertDialog.Title>
			<AlertDialog.Description>
				Cette action est irréversible. Le sujet sera définitivement supprimé de votre catalogue.
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
								const data = result.data as { message?: string } | undefined;
								toast.error(data?.message || 'Erreur lors de la suppression');
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

<style>
	@keyframes slideUpFade {
		from {
			opacity: 0;
			transform: translateY(15px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.subject-card {
		animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
	}
</style>
