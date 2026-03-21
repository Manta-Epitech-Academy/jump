<script lang="ts">
	import type { CampusesResponse } from '$lib/pocketbase-types';
	import { Users, Trash2, Mail } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
	import { pbUrl } from '$lib/pocketbase';

	let { data } = $props();

	// Handle component deletion confirmations
	let deleteDialogOpen = $state(false);
	let userToDelete = $state<string | null>(null);

	function confirmDelete(id: string) {
		userToDelete = id;
		deleteDialogOpen = true;
	}

	// Retrieve user avatar through the PocketBase files API
	function getAvatarUrl(user: any) {
		if (user?.avatar) return `${pbUrl}/api/files/${user.collectionId}/${user.id}/${user.avatar}`;
		return undefined;
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="font-heading text-3xl tracking-wide uppercase">
			Équipe <span class="text-epi-pink">Staff</span>
		</h1>
		<p class="text-sm font-bold text-muted-foreground uppercase">
			Gérer les accès et rattachements
		</p>
	</div>

	<div class="rounded-sm border bg-card shadow-sm">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Utilisateur</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head>Campus</Table.Head>
					<Table.Head class="text-right">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.users as user}
					<Table.Row>
						<Table.Cell>
							<div class="flex items-center gap-3">
								<Avatar.Root class="h-8 w-8">
									<Avatar.Image src={getAvatarUrl(user)} />
									<Avatar.Fallback class="text-xs font-bold"
										>{user.name?.substring(0, 2).toUpperCase() || 'ST'}</Avatar.Fallback
									>
								</Avatar.Root>
								<span class="font-bold">{user.name || 'Sans nom'}</span>
							</div>
						</Table.Cell>
						<Table.Cell>
							<div class="flex items-center gap-2 text-sm text-muted-foreground">
								<Mail class="h-3 w-3" />
								<a
									href="mailto:{user.email}"
									class="transition-colors hover:text-epi-pink hover:underline"
								>
									{user.email}
								</a>
							</div>
						</Table.Cell>
						<Table.Cell>
							<form
								method="POST"
								action="?/updateCampus"
								use:enhance={() => {
									return async ({ update, result }) => {
										if (result.type === 'success') toast.success('Campus mis à jour');
										await update();
									};
								}}
							>
								<input type="hidden" name="userId" value={user.id} />
								<Select.Root type="single" name="campusId" value={user.campus}>
									<Select.Trigger class="h-8 w-40 text-xs">
										{(user.expand as { campus?: CampusesResponse })?.campus?.name || 'Aucun campus'}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="">Aucun campus</Select.Item>
										{#each data.campuses as c}
											<Select.Item value={c.id}>{c.name}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<button type="submit" class="hidden">Save</button>
							</form>
						</Table.Cell>
						<Table.Cell class="text-right">
							<Button
								variant="ghost"
								size="icon"
								class="text-destructive hover:bg-destructive/10"
								onclick={() => confirmDelete(user.id)}
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<ConfirmDeleteDialog
		bind:open={deleteDialogOpen}
		action="?/deleteUser&id={userToDelete}"
		title="Révoquer l'accès"
		description="Êtes-vous sûr de vouloir supprimer ce membre du Staff ? Il perdra l'accès à l'application."
	/>
</div>
