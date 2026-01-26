<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Search, BookOpen, Funnel, Tag, ExternalLink, Sparkles } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	let {
		open = $bindable(false),
		subjects = [],
		themes = [],
		currentSubjectId = null,
		studentLevel = null,
		onSelect
	}: {
		open: boolean;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		subjects: any[];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		themes: any[];
		currentSubjectId?: string | null;
		studentLevel?: string | null;
		onSelect: (subjectId: string | null) => void;
	} = $props();

	let searchQuery = $state('');
	let selectedLevel = $state('all');
	let selectedTheme = $state('all');

	const levels = ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'];

	// Helper to calculate XP visually
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function getXp(niveaux: string[]): number {
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

	let filteredSubjects = $derived(
		subjects
			.filter((sub) => {
				// Search
				const searchLower = searchQuery.toLowerCase();
				const matchesSearch =
					sub.nom.toLowerCase().includes(searchLower) ||
					(sub.description || '').toLowerCase().includes(searchLower);

				// Level Filter
				const matchesLevel =
					selectedLevel === 'all' || (sub.niveaux && sub.niveaux.includes(selectedLevel));

				// Theme Filter
				const matchesTheme =
					selectedTheme === 'all' ||
					(sub.expand?.themes &&
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						sub.expand.themes.some((t: any) => t.id === selectedTheme || t.nom === selectedTheme));

				return matchesSearch && matchesLevel && matchesTheme;
			})
			.sort((a, b) => {
				// Sort logic: "Recommended" (matches student level) first, then alphabetical
				if (studentLevel) {
					const aMatch = a.niveaux?.includes(studentLevel) ? 1 : 0;
					const bMatch = b.niveaux?.includes(studentLevel) ? 1 : 0;
					if (aMatch !== bMatch) return bMatch - aMatch;
				}
				return a.nom.localeCompare(b.nom);
			})
	);

	function handleSelect(id: string | null) {
		onSelect(id);
		open = false;
		// Reset filters slightly after closing for smooth animation
		setTimeout(() => {
			searchQuery = '';
		}, 300);
	}

	// Helper to display theme name in Select trigger
	function getThemeName(id: string) {
		if (id === 'all') return 'Tous';
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const t = themes.find((th: any) => th.id === id);
		return t ? t.nom : id;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex h-full max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
		<Dialog.Header class="shrink-0 px-6 py-4 pb-2">
			<Dialog.Title class="flex items-center gap-2 uppercase">
				<BookOpen class="h-5 w-5 text-epi-blue" />
				Sélectionner un sujet
			</Dialog.Title>
			<Dialog.Description>
				Choisissez un sujet adapté au niveau de l'élève ({studentLevel || 'N/A'}).
			</Dialog.Description>
		</Dialog.Header>

		<!-- FILTERS BAR -->
		<div class="shrink-0 border-b bg-muted/30 p-4">
			<div class="flex flex-col gap-3">
				<div class="relative">
					<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Rechercher par nom, description..."
						class="bg-background pl-9"
						bind:value={searchQuery}
					/>
				</div>
				<div class="flex flex-wrap gap-2">
					<!-- Level Filter -->
					<div class="flex h-9 items-center rounded-sm border bg-background">
						<div
							class="flex h-full items-center border-r bg-muted/10 px-2 text-xs font-bold text-muted-foreground uppercase"
						>
							Niveau
						</div>
						<Select.Root type="single" bind:value={selectedLevel}>
							<Select.Trigger
								class="h-full min-w-20 border-0 bg-transparent px-2 text-xs font-bold uppercase shadow-none focus:ring-0"
							>
								{selectedLevel === 'all' ? 'Tous' : selectedLevel}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="all">Tous</Select.Item>
								{#each levels as lvl}
									<Select.Item value={lvl}>{lvl}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<!-- Theme Filter -->
					<div class="flex h-9 items-center rounded-sm border bg-background">
						<div
							class="flex h-full items-center border-r bg-muted/10 px-2 text-xs font-bold text-muted-foreground uppercase"
						>
							Thème
						</div>
						<Select.Root type="single" bind:value={selectedTheme}>
							<Select.Trigger
								class="h-full min-w-[100px] border-0 bg-transparent px-2 text-xs font-bold uppercase shadow-none focus:ring-0"
							>
								{getThemeName(selectedTheme)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="all">Tous</Select.Item>
								{#each themes as theme}
									<Select.Item value={theme.id}>{theme.nom}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<!-- Quick Filter: Student Level -->
					{#if studentLevel && selectedLevel !== studentLevel}
						<Button
							variant="outline"
							size="sm"
							class="h-9 border-epi-teal/50 bg-epi-teal/10 text-xs text-teal-700 hover:bg-epi-teal/20 dark:text-teal-400"
							onclick={() => (selectedLevel = studentLevel || 'all')}
						>
							<Sparkles class="mr-1 h-3 w-3" />
							Niveau {studentLevel}
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- LIST -->
		<ScrollArea class="min-h-0 flex-1">
			<div class="divide-y p-0">
				{#if currentSubjectId}
					<div class="bg-destructive/5 p-2 text-center">
						<Button
							variant="ghost"
							size="sm"
							class="h-auto py-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
							onclick={() => handleSelect(null)}
						>
							Retirer le sujet actuel
						</Button>
					</div>
				{/if}

				{#each filteredSubjects as sub (sub.id)}
					{@const isSelected = sub.id === currentSubjectId}
					{@const isRecommended = studentLevel && sub.niveaux?.includes(studentLevel)}

					<button
						class={cn(
							'flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-muted/50',
							isSelected && 'bg-epi-blue/5 hover:bg-epi-blue/10',
							isRecommended && !isSelected && 'bg-epi-teal/5'
						)}
						onclick={() => handleSelect(sub.id)}
					>
						<div class="flex w-full items-start justify-between gap-4">
							<div class="flex flex-col gap-1">
								<div class="flex items-center gap-2">
									<span class="font-bold text-foreground uppercase">{sub.nom}</span>
									{#if isRecommended}
										<Badge
											variant="outline"
											class="border-epi-teal text-[9px] text-teal-700 dark:text-teal-400"
										>
											Recommandé
										</Badge>
									{/if}
									{#if isSelected}
										<Badge class="bg-epi-blue text-[9px]">Actuel</Badge>
									{/if}
								</div>

								{#if sub.expand?.themes}
									<div class="flex flex-wrap gap-1">
										{#each sub.expand.themes as t}
											<div class="flex items-center text-[10px] text-muted-foreground uppercase">
												<Tag class="mr-0.5 h-3 w-3" />
												{t.nom}
											</div>
										{/each}
									</div>
								{/if}
							</div>

							<div class="flex flex-col items-end gap-1">
								<Badge variant="secondary" class="font-mono font-bold text-epi-orange">
									{getXp(sub.niveaux)} XP
								</Badge>
							</div>
						</div>

						<p class="line-clamp-2 text-xs text-muted-foreground">
							{sub.description}
						</p>

						<div class="mt-1 flex items-center justify-between">
							<div class="flex flex-wrap gap-1">
								{#each sub.niveaux as niv}
									<span
										class={cn(
											'rounded-xs border px-1 py-0.5 text-[9px] font-bold uppercase',
											studentLevel === niv
												? 'border-epi-teal bg-epi-teal text-black'
												: 'border-border text-muted-foreground'
										)}
									>
										{niv}
									</span>
								{/each}
							</div>
							{#if sub.link}
								<a
									href={sub.link}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center text-[10px] font-bold text-epi-blue hover:underline"
									onclick={(e) => e.stopPropagation()}
								>
									Voir le sujet <ExternalLink class="ml-1 h-3 w-3" />
								</a>
							{/if}
						</div>
					</button>
				{:else}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<Funnel class="mb-2 h-8 w-8 text-muted-foreground/50" />
						<p class="text-sm font-bold text-muted-foreground uppercase">Aucun sujet trouvé.</p>
						<p class="text-xs text-muted-foreground">Essayez de modifier les filtres.</p>
					</div>
				{/each}
			</div>
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>
