<script lang="ts">
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		Calendar,
		Tag,
		Plus,
		Ellipsis,
		Trash2,
		Pencil,
		Coffee,
		Megaphone,
		UserCheck,
		Copy
	} from 'lucide-svelte';

	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import DuplicateEventDialog from '$lib/components/events/DuplicateEventDialog.svelte';

	let { data } = $props();

	function formatDate(date: Date): string {
		return date.toLocaleDateString('fr-FR', {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
	}

	/**
	 * Logic:
	 * - If date is > 1 hour in the future: "À venir"
	 * - If date is between 1h ago and 3h in the future: "En cours" (broad window for the event day)
	 * - If date is > 3h in the past: "Terminé"
	 */
	function getEventStatus(date: Date) {
		const now = new Date();
		const diff = date.getTime() - now.getTime();
		const hours = diff / (1000 * 60 * 60);

		if (hours > 1) return 'future';
		if (hours < -4) return 'past';
		return 'now';
	}

	let deleteDialogOpen = $state(false);
	let eventToDelete = $state<string | null>(null);

	let duplicateDialogOpen = $state(false);
	let eventToDuplicate = $state<{ id: string; titre: string; date: Date } | null>(null);

	function confirmDelete(id: string) {
		eventToDelete = id;
		deleteDialogOpen = true;
	}

	function openDuplicate(event: { id: string; titre: string; date: Date }) {
		eventToDuplicate = event;
		duplicateDialogOpen = true;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold text-epi-blue uppercase">
				Dashboard<span class="text-epi-orange">_</span>
			</h1>
			<p class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
				{data.events.length} événement{data.events.length > 1 ? 's' : ''} programmés
			</p>
		</div>
		<Button size="sm" href={resolve('/events/new')} class="bg-epi-blue shadow-lg">
			<Plus class="mr-2 h-4 w-4" />
			<span class="hidden sm:inline">Nouvel Événement</span>
			<span class="inline sm:hidden">Nouveau</span>
		</Button>
	</div>

	{#if data.events.length > 0}
		<div class="rounded-sm border bg-card shadow-sm">
			<Table>
				<TableHeader class="bg-muted/50">
					<TableRow>
						<TableHead class="text-xs font-bold uppercase">Événement</TableHead>
						<TableHead class="text-xs font-bold uppercase">Date & Heure</TableHead>
						<TableHead class="hidden text-xs font-bold uppercase md:table-cell">Thème</TableHead>
						<TableHead class="hidden text-center text-xs font-bold uppercase md:table-cell"
							>Statut</TableHead
						>
						<TableHead class="text-right"></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.events as event}
						{@const status = getEventStatus(event.date)}
						<TableRow class="hover:bg-muted/30">
							<TableCell class="font-bold">
								<span style:view-transition-name="event-title-{event.id}">
									{event.titre}
								</span>
							</TableCell>
							<TableCell>
								<div class="flex items-center gap-2">
									<Calendar class="hidden h-4 w-4 text-muted-foreground sm:block" />
									<div class="flex flex-col sm:flex-row sm:items-center sm:gap-2">
										<span class="font-medium">{formatDate(event.date)}</span>
										<span class="text-xs text-muted-foreground sm:text-sm"
											>• {formatTime(event.date)}</span
										>
									</div>
								</div>
							</TableCell>
							<TableCell class="hidden md:table-cell">
								{#if event.theme}
									<div class="flex items-center gap-2">
										<Tag class="h-4 w-4 text-teal-700" />
										<span class="font-bold text-teal-800">{event.theme}</span>
									</div>
								{:else}
									<span class="text-sm text-muted-foreground italic">Aucun thème</span>
								{/if}
							</TableCell>
							<TableCell class="hidden text-center md:table-cell">
								{#if status === 'future'}
									<span
										class="inline-block rounded-sm bg-blue-100 px-2 py-1 text-[10px] font-black tracking-widest text-blue-700 uppercase"
									>
										À venir
									</span>
								{:else if status === 'now'}
									<span
										class="inline-block rounded-sm bg-epi-orange/20 px-2 py-1 text-[10px] font-black tracking-widest text-epi-orange uppercase"
									>
										En cours
									</span>
								{:else}
									<span
										class="inline-block rounded-sm bg-epi-teal/20 px-2 py-1 text-[10px] font-black tracking-widest text-green-700 uppercase"
									>
										Terminé
									</span>
								{/if}
							</TableCell>
							<TableCell class="text-right">
								<div class="flex items-center justify-end gap-2">
									<Tooltip.Provider delayDuration={300}>
										<Tooltip.Root>
											<Tooltip.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														variant="outline"
														size="icon"
														href={resolve(`/events/${event.id}/appel`)}
														class="h-9 w-9 border-epi-teal/30 bg-epi-teal/10 text-teal-700 hover:bg-epi-teal hover:text-black dark:text-epi-teal dark:hover:text-black"
													>
														<UserCheck class="h-5 w-5" />
													</Button>
												{/snippet}
											</Tooltip.Trigger>
											<Tooltip.Content>
												<p>Faire l'appel</p>
											</Tooltip.Content>
										</Tooltip.Root>
									</Tooltip.Provider>

									<DropdownMenu.Root>
										<DropdownMenu.Trigger
											class={buttonVariants({ variant: 'ghost', size: 'icon' })}
										>
											<Ellipsis class="h-4 w-4" />
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item class="p-0">
												{#snippet child({ props })}
													<a
														{...props}
														href={resolve(`/events/${event.id}/builder`)}
														class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
													>
														<Pencil class="mr-2 h-4 w-4 text-muted-foreground" />
														Modifier / Builder
													</a>
												{/snippet}
											</DropdownMenu.Item>

											<DropdownMenu.Separator />

											<DropdownMenu.Item
												class="cursor-pointer"
												onclick={() => openDuplicate(event)}
											>
												<Copy class="mr-2 h-4 w-4 text-muted-foreground" />
												Dupliquer
											</DropdownMenu.Item>

											<DropdownMenu.Separator />

											<DropdownMenu.Item
												class="cursor-pointer text-destructive"
												onclick={() => confirmDelete(event.id)}
											>
												<Trash2 class="mr-2 h-4 w-4" />
												Supprimer
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</div>
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>
	{:else}
		<div
			class="flex flex-col items-center justify-center rounded-sm border-2 border-dashed border-border bg-muted/20 p-20 text-center"
		>
			<div class="relative mb-6">
				<div class="absolute inset-0 animate-ping rounded-full bg-epi-blue/20"></div>
				<div
					class="relative flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm"
				>
					<Coffee class="h-10 w-10 text-muted-foreground/70" />
					<div class="absolute -top-1 -right-2 rotate-12 text-3xl">💤</div>
				</div>
			</div>
			<h3 class="font-heading text-2xl tracking-wide text-foreground uppercase">
				Allo l'équipe Dev ?
			</h3>
			<p class="mt-3 max-w-sm text-sm font-medium text-muted-foreground">
				C'est louche... Le calendrier est vide.<br />
				Vous êtes partis en vacances ou vous avez fini le game ?
			</p>
			<Button
				href={resolve('/events/new')}
				class="mt-8 bg-epi-blue text-white shadow-lg transition-transform hover:scale-105 hover:bg-epi-blue/90"
			>
				<Megaphone class="mr-2 h-4 w-4" />
				Créer un événement
			</Button>
		</div>
	{/if}

	<!-- DUPLICATE DIALOG -->
	<DuplicateEventDialog bind:open={duplicateDialogOpen} {eventToDuplicate} />

	<AlertDialog.Root bind:open={deleteDialogOpen}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Supprimer l'événement</AlertDialog.Title>
				<AlertDialog.Description>
					Êtes-vous sûr de vouloir supprimer cet événement ? Cette action est irréversible et
					retirera les XP acquis par les participants.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
				{#if eventToDelete}
					<form
						action="?/deleteEvent&id={eventToDelete}"
						method="POST"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success('Événement supprimé');
									deleteDialogOpen = false;
									await update();
								} else {
									toast.error('Erreur lors de la suppression');
								}
							};
						}}
					>
						<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>
							Supprimer définitivement
						</AlertDialog.Action>
					</form>
				{/if}
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
</div>
