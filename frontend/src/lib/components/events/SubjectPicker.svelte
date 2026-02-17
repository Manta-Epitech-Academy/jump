<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import {
		Search,
		BookOpen,
		Funnel,
		Tag,
		ExternalLink,
		Sparkles,
		School,
		MapPin,
		Globe,
		Share2,
		Check,
		Save,
		X
	} from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { page } from '$app/state';

	let {
		open = $bindable(false),
		subjects = [],
		themes = [],
		selectedSubjectIds = [],
		studentLevel = null,
		onSave
	}: {
		open: boolean;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		subjects: any[];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		themes: any[];
		selectedSubjectIds: string[];
		studentLevel?: string | null;
		onSave: (ids: string[]) => void;
	} = $props();

	// Get user campus ID to detect "Mine" vs "Community"
	let userCampusId = $derived(page.data.user?.campus);

	let searchQuery = $state('');
	let selectedLevel = $state('all');
	let selectedTheme = $state('all');
	let selectedSource = $state('all'); // all, official, mine, community

	// Internal state for selection within the modal
	let currentSelection = $state<string[]>([]);

	// Reset/Sync local selection when modal opens
	$effect(() => {
		if (open) {
			currentSelection = [...selectedSubjectIds];
		}
	});

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
						sub.expand.themes.some(
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(t: any) => t.id === selectedTheme || t.nom === selectedTheme
						));

				// Source Filter Logic
				const isOfficial = !sub.campus;
				const isMine = sub.campus === userCampusId;
				let matchesSource = true;
				if (selectedSource === 'official') matchesSource = isOfficial;
				if (selectedSource === 'mine') matchesSource = isMine;
				if (selectedSource === 'community') matchesSource = !isOfficial && !isMine;

				return matchesSearch && matchesLevel && matchesTheme && matchesSource;
			})
			.sort((a, b) => {
				// Selection priority
				const aSel = currentSelection.includes(a.id) ? 1 : 0;
				const bSel = currentSelection.includes(b.id) ? 1 : 0;
				if (aSel !== bSel) return bSel - aSel;

				// Sort logic: "Recommended" (matches student level) first, then alphabetical
				if (studentLevel) {
					const aMatch = a.niveaux?.includes(studentLevel) ? 1 : 0;
					const bMatch = b.niveaux?.includes(studentLevel) ? 1 : 0;
					if (aMatch !== bMatch) return bMatch - aMatch;
				}
				return a.nom.localeCompare(b.nom);
			})
	);

	function toggleSubject(id: string) {
		if (currentSelection.includes(id)) {
			currentSelection = currentSelection.filter((s) => s !== id);
		} else {
			currentSelection = [...currentSelection, id];
		}
	}

	function handleSave() {
		onSave(currentSelection);
		open = false;
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
				Gérer les sujets
			</Dialog.Title>
			<Dialog.Description>
				Assignez un ou plusieurs sujets à l'élève ({studentLevel || 'N/A'}).
			</Dialog.Description>
		</Dialog.Header>

		<!-- FILTERS & ACTIONS BAR -->
		<div class="shrink-0 border-b bg-muted/30 p-4">
			<div class="flex flex-col gap-3">
				<div class="flex gap-2">
					<div class="relative flex-1">
						<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Rechercher par nom..."
							class="bg-background pl-9"
							bind:value={searchQuery}
						/>
					</div>
					<Button onclick={handleSave} class="bg-epi-blue shadow-lg">
						<Save class="mr-2 h-4 w-4" />
						Enregistrer ({currentSelection.length})
					</Button>
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

					<!-- Source Filter -->
					<div class="flex h-9 items-center rounded-sm border bg-background">
						<div
							class="flex h-full items-center border-r bg-muted/10 px-2 text-xs font-bold text-muted-foreground uppercase"
						>
							Origine
						</div>
						<Select.Root type="single" bind:value={selectedSource}>
							<Select.Trigger
								class="h-full min-w-25 border-0 bg-transparent px-2 text-xs font-bold uppercase shadow-none focus:ring-0"
							>
								{#if selectedSource === 'all'}Tous
								{:else if selectedSource === 'official'}Officiel
								{:else if selectedSource === 'mine'}Local
								{:else}Communauté{/if}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="all">Tous</Select.Item>
								<Select.Item value="official">Officiel</Select.Item>
								<Select.Item value="mine">Mon Campus</Select.Item>
								<Select.Item value="community">Communauté</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>

					{#if studentLevel && selectedLevel !== studentLevel}
						<Button
							variant="outline"
							size="sm"
							class="h-9 border-epi-teal/50 bg-epi-teal/10 text-xs text-teal-700 hover:bg-epi-teal/20"
							onclick={() => (selectedLevel = studentLevel || 'all')}
						>
							<Sparkles class="mr-1 h-3 w-3" />
							Niveau {studentLevel}
						</Button>
					{/if}
				</div>

				<!-- Selection summary tags -->
				{#if currentSelection.length > 0}
					<div class="flex flex-wrap gap-1 border-t pt-2">
						{#each currentSelection as id}
							{@const sub = subjects.find((s) => s.id === id)}
							{#if sub}
								<Badge variant="outline" class="gap-1 border bg-background text-[10px]">
									{sub.nom}
									<button
										onclick={() => toggleSubject(id)}
										class="ml-1 cursor-pointer hover:text-destructive"
									>
										<X class="h-3 w-3" />
									</button>
								</Badge>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- LIST -->
		<ScrollArea class="min-h-0 flex-1">
			<div class="divide-y p-0">
				{#each filteredSubjects as sub (sub.id)}
					{@const isSelected = currentSelection.includes(sub.id)}
					{@const isRecommended = studentLevel && sub.niveaux?.includes(studentLevel)}
					{@const isOfficial = !sub.campus}
					{@const isMine = sub.campus === userCampusId}

					<button
						class={cn(
							'flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/50',
							isSelected && 'bg-epi-blue/5 hover:bg-epi-blue/10',
							isRecommended && !isSelected && 'bg-epi-teal/5'
						)}
						onclick={() => toggleSubject(sub.id)}
					>
						<div class="flex items-start gap-4">
							<div
								class={cn(
									'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-all',
									isSelected
										? 'border-epi-blue bg-epi-blue text-white'
										: 'border-muted-foreground/30 bg-background'
								)}
							>
								{#if isSelected}
									<Check class="h-4 w-4" />
								{/if}
							</div>

							<div class="flex flex-col gap-1">
								<div class="flex items-center gap-2">
									<span class="font-bold text-foreground uppercase">{sub.nom}</span>

									{#if isOfficial}
										<div
											class="flex items-center gap-1 text-[10px] font-bold text-epi-blue uppercase"
										>
											<School class="h-3 w-3" />
										</div>
									{:else if isMine}
										<div
											class="flex items-center gap-1 text-[10px] font-bold text-teal-700 uppercase"
										>
											<MapPin class="h-3 w-3" />
										</div>
									{/if}
								</div>

								<p class="line-clamp-1 text-xs text-muted-foreground">
									{sub.description}
								</p>

								<div class="mt-1 flex flex-wrap gap-1">
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
							</div>
						</div>

						<div class="flex flex-col items-end gap-1">
							<Badge variant="secondary" class="font-mono font-bold text-epi-orange">
								{getXp(sub.niveaux)} XP
							</Badge>
						</div>
					</button>
				{:else}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<BookOpen class="mb-2 h-8 w-8 text-muted-foreground/50" />
						<p class="text-sm font-bold text-muted-foreground uppercase">Aucun sujet trouvé.</p>
					</div>
				{/each}
			</div>
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>
