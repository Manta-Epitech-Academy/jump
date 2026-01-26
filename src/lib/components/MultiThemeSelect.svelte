<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Plus, X, Tag } from 'lucide-svelte';

	let {
		themes = [],
		value = $bindable([]),
		name = 'themes'
	}: {
		themes: any[];
		value: string[];
		name?: string;
	} = $props();

	let open = $state(false);
	let searchValue = $state('');

	// Filter themes that are not already selected
	let availableThemes = $derived(themes.filter((t) => !value.includes(t.nom)));

	// Check if search matches an existing theme exactly (case insensitive)
	let exactMatch = $derived(themes.find((t) => t.nom.toLowerCase() === searchValue.toLowerCase()));

	function selectTheme(val: string) {
		if (!value.includes(val)) {
			value = [...value, val];
		}
		searchValue = '';
	}

	function removeTheme(val: string) {
		value = value.filter((v) => v !== val);
	}
</script>

<div class="grid gap-2">
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					class="h-auto min-h-10 w-full justify-between px-3 py-2"
					{...props}
				>
					<div class="flex flex-wrap gap-2">
						{#if value.length === 0}
							<span class="flex items-center gap-2 text-muted-foreground">
								<Tag class="h-3.5 w-3.5 text-epi-teal" />
								Sélectionner des thèmes...
							</span>
						{:else}
							{#each value as item}
								<Badge
									variant="secondary"
									class="rounded-sm border border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-900/30 dark:text-teal-100"
								>
									{item}
									<button
										class="ml-1 rounded-full ring-offset-background hover:bg-black/10 focus:ring-2 focus:ring-ring focus:outline-none dark:hover:bg-white/10"
										onclick={(e) => {
											e.stopPropagation();
											removeTheme(item);
										}}
									>
										<X class="h-3 w-3" />
									</button>
								</Badge>
							{/each}
						{/if}
					</div>
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-[--bits-popover-anchor-width] p-0" align="start">
			<Command.Root>
				<Command.Input placeholder="Chercher ou créer..." bind:value={searchValue} />
				<Command.List>
					<Command.Empty>
						{#if searchValue.trim().length > 0}
							<Button
								variant="ghost"
								class="flex h-auto w-full items-center justify-start gap-2 px-2 py-3 text-left"
								onclick={() => selectTheme(searchValue)}
							>
								<Plus class="h-4 w-4 text-epi-blue" />
								<div class="flex flex-col">
									<span class="text-sm font-bold">Créer "{searchValue}"</span>
									<span
										class="text-[10px] font-black tracking-widest text-muted-foreground uppercase"
										>Nouveau thème</span
									>
								</div>
							</Button>
						{:else}
							<p class="py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
						{/if}
					</Command.Empty>

					<Command.Group heading="Thèmes disponibles">
						{#each availableThemes as theme}
							<Command.Item value={theme.nom} onSelect={() => selectTheme(theme.nom)}>
								<div
									class="mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary/20"
								>
									<!-- Empty box icon effect -->
								</div>
								{theme.nom}
							</Command.Item>
						{/each}
					</Command.Group>

					{#if searchValue && !exactMatch && !value.includes(searchValue)}
						<Command.Separator />
						<Command.Group heading="Action">
							<Command.Item value={searchValue} onSelect={() => selectTheme(searchValue)}>
								<Plus class="mr-2 h-4 w-4 text-epi-blue" />
								Créer "{searchValue}"
							</Command.Item>
						</Command.Group>
					{/if}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>

	<!-- Hidden inputs for Superforms array binding -->
	{#each value as v}
		<input type="hidden" {name} value={v} />
	{/each}
</div>
