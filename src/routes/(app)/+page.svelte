<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Calendar, Clock, Activity, Plus } from '@lucide/svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data } = $props();

	function formatDate(date: Date): string {
		return date.toLocaleDateString('fr-FR', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Mes Sessions</h1>
			<p class="text-muted-foreground">
				{data.sessions.length} session{data.sessions.length > 1 ? 's' : ''} à venir
			</p>
		</div>
		<Button size="lg" onclick={() => goto('/sessions/new')}>
			<Plus class="mr-2 h-4 w-4" />
			Nouvelle Session
		</Button>
	</div>

	{#if data.sessions.length > 0}
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Titre</TableHead>
					<TableHead>Date</TableHead>
					<TableHead>Activité</TableHead>
					<TableHead>Statut</TableHead>
					<TableHead class="text-right">Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.sessions as session}
					<TableRow>
						<TableCell class="font-medium">{session.titre}</TableCell>
						<TableCell>
							<div class="flex items-center">
								<Calendar class="text-muted-foreground mr-2 h-4 w-4" />
								<div>
									<p>{formatDate(session.date)}</p>
									<p class="text-muted-foreground text-sm">
										{formatTime(session.date)}
									</p>
								</div>
							</div>
						</TableCell>
						<TableCell>
							{#if session.activity}
								<div class="flex items-center">
									<Activity class="text-muted-foreground mr-2 h-4 w-4" />
									{session.activity.nom}
									{#if session.activity.difficulte}
										<span
											class="bg-muted ml-2 inline-flex h-6 w-16 items-center justify-center rounded-full px-2 py-1 text-xs font-medium"
										>
											{session.activity.difficulte}
										</span>
									{/if}
								</div>
							{:else}
								<span class="text-muted-foreground text-sm">Non définie</span>
							{/if}
						</TableCell>
						<TableCell>
							{#if session.statut === 'planifiee'}
								<div
									class="inline-flex h-8 w-24 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-800 ring-blue-200"
								>
									À venir
								</div>
							{:else if session.statut === 'en_cours'}
								<div
									class="inline-flex h-8 w-24 items-center justify-center rounded-full bg-orange-100 text-xs font-medium text-orange-800 ring-orange-200"
								>
									En cours
								</div>
							{:else}
								<div
									class="inline-flex h-8 w-24 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-800 ring-green-200"
								>
									Terminée
								</div>
							{/if}
						</TableCell>
						<TableCell class="text-right">
							<Button variant="outline" size="sm" href={`/sessions/${session.id}/builder`}>
								Gérer
							</Button>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	{:else}
		<div
			class="flex flex-col items-center justify-center rounded-md border-4 border-dashed border-gray-200 p-12 text-center"
		>
			<Calendar class="mx-auto h-12 w-12 text-gray-400" />
			<h3 class="mt-4 text-lg font-medium text-gray-900">Aucune session</h3>
			<p class="mt-2 text-sm text-gray-500">Crée ta première session pour commencer.</p>
			<div class="mt-6">
				<Button>
					<Plus class="mr-2 h-4 w-4" />
					Nouvelle Session
				</Button>
			</div>
		</div>
	{/if}
</div>
