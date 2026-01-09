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
	import { Calendar, Activity, Plus, ChevronRight } from 'lucide-svelte';
	import { goto } from '$app/navigation';

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
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight text-epi-blue uppercase">
				Dashboard<span class="text-epi-orange">_</span>
			</h1>
			<p class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
				{data.sessions.length} session{data.sessions.length > 1 ? 's' : ''} à venir
			</p>
		</div>
		<Button size="sm" onclick={() => goto('/sessions/new')} class="bg-epi-blue shadow-lg">
			<Plus class="mr-2 h-4 w-4" />
			Nouvelle Session
		</Button>
	</div>

	{#if data.sessions.length > 0}
		<div class="rounded-sm border bg-card shadow-sm">
			<Table>
				<TableHeader class="bg-muted/50">
					<TableRow>
						<TableHead class="text-xs font-bold uppercase">Session</TableHead>
						<TableHead class="text-xs font-bold uppercase">Date & Heure</TableHead>
						<TableHead class="text-xs font-bold uppercase">Activité</TableHead>
						<TableHead class="text-center text-xs font-bold uppercase">Statut</TableHead>
						<TableHead class="text-right"></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.sessions as session}
						<TableRow class="hover:bg-muted/30">
							<TableCell class="font-bold">{session.titre}</TableCell>
							<TableCell>
								<div class="flex items-center gap-2">
									<Calendar class="h-4 w-4 text-muted-foreground" />
									<span class="font-medium">{formatDate(session.date)}</span>
									<span class="text-muted-foreground">• {formatTime(session.date)}</span>
								</div>
							</TableCell>
							<TableCell>
								{#if session.activity}
									<div class="flex items-center gap-2">
										<Activity class="h-4 w-4 text-epi-blue" />
										<span class="font-medium">{session.activity.nom}</span>
									</div>
								{:else}
									<span class="text-sm text-muted-foreground">Standard</span>
								{/if}
							</TableCell>
							<TableCell class="text-center">
								{#if session.statut === 'planifiee'}
									<span
										class="inline-block rounded-sm bg-blue-100 px-2 py-1 text-[10px] font-black tracking-widest text-blue-700 uppercase"
									>
										À venir
									</span>
								{:else if session.statut === 'en_cours'}
									<span
										class="inline-block rounded-sm bg-epi-orange/20 px-2 py-1 text-[10px] font-black tracking-widest text-epi-orange uppercase"
									>
										En cours
									</span>
								{:else}
									<span
										class="inline-block rounded-sm bg-epi-teal/20 px-2 py-1 text-[10px] font-black tracking-widest text-green-700 uppercase"
									>
										Terminée
									</span>
								{/if}
							</TableCell>
							<TableCell class="text-right">
								<Button variant="ghost" size="icon" href={`/sessions/${session.id}/builder`}>
									<ChevronRight class="h-5 w-5 text-gray-400" />
								</Button>
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
			<Calendar class="mx-auto h-12 w-12 text-muted" />
			<h3 class="mt-4 text-lg font-bold uppercase">Aucune session</h3>
			<p class="mt-1 text-sm font-bold tracking-tight text-muted-foreground uppercase">
				Le planning est vide pour le moment.
			</p>
		</div>
	{/if}
</div>
