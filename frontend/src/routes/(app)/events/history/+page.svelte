<script lang="ts">
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		Calendar,
		Tag,
		ArrowLeft,
		Archive,
		Users,
		UserCheck,
		Ellipsis,
		Pencil,
		Copy,
		Trash2
	} from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { formatDateFr } from '$lib/utils';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
	}

	let deleteDialogOpen = $state(false);
	let eventToDelete = $state<string | null>(null);

	function confirmDelete(id: string) {
		eventToDelete = id;
		deleteDialogOpen = true;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="icon" href={resolve('/')}>
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div>
				<h1 class="text-3xl font-bold text-epi-blue uppercase">
					Historique<span class="text-epi-teal">_</span>
				</h1>
				<p class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
					Archives des événements passés
				</p>
			</div>
		</div>
	</div>

	{#if data.events.length > 0}
		<div class="rounded-sm border bg-card shadow-sm">
			<Table>
				<TableHeader class="bg-muted/50">
					<TableRow>
						<TableHead class="text-xs font-bold uppercase">Événement</TableHead>
						<TableHead class="text-xs font-bold uppercase">Date</TableHead>
						<TableHead class="text-xs font-bold uppercase">Thème</TableHead>
						<TableHead class="text-center text-xs font-bold uppercase">Participation</TableHead>
						<TableHead class="text-right"></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.events as event}
						<TableRow class="hover:bg-muted/30">
							<TableCell class="font-bold">
								<span class="text-muted-foreground">{event.titre}</span>
							</TableCell>
							<TableCell>
								<div class="flex items-center gap-2">
									<Calendar class="h-4 w-4 text-muted-foreground" />
									<span class="font-medium">{formatDateFr(event.date)}</span>
									<span class="text-xs text-muted-foreground">{formatTime(event.date)}</span>
								</div>
							</TableCell>
							<TableCell>
								{#if event.theme}
									<div class="flex items-center gap-2">
										<Tag class="h-4 w-4 text-teal-700/70" />
										<span class="font-bold text-teal-800/70">{event.theme}</span>
									</div>
								{:else}
									<span class="text-sm text-muted-foreground italic">Aucun thème</span>
								{/if}
							</TableCell>
							<TableCell class="text-center">
								<Badge variant="secondary" class="gap-1 font-mono">
									<Users class="h-3 w-3" />
									{event.presentCount}
								</Badge>
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
												<p>Consulter l'appel</p>
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

											<DropdownMenu.Item class="p-0">
												{#snippet child({ props })}
													<form
														action="?/duplicateEvent&id={event.id}"
														method="POST"
														use:enhance={() => {
															return async ({ result, update }) => {
																if (result.type === 'success') {
																	toast.success('Événement dupliqué avec ses participants');
																	await update();
																} else {
																	toast.error('Erreur lors de la duplication');
																}
															};
														}}
														class="w-full"
													>
														<button
															{...props}
															type="submit"
															class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
														>
															<Copy class="mr-2 h-4 w-4 text-muted-foreground" />
															Dupliquer
														</button>
													</form>
												{/snippet}
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
			class="flex flex-col items-center justify-center rounded-sm border bg-card p-20 text-center shadow-sm"
		>
			<Archive class="mx-auto h-12 w-12 text-muted" />
			<h3 class="mt-4 text-lg font-bold uppercase">Historique vide</h3>
			<p class="mt-1 text-sm font-bold text-muted-foreground uppercase">
				Aucun événement passé n'a été trouvé.
			</p>
		</div>
	{/if}

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
