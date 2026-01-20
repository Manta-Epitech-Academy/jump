<script lang="ts">
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Calendar, Tag, Eye, ArrowLeft, Archive, Users } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { formatDateFr } from '$lib/utils';

	let { data } = $props();

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="ghost" size="icon" href="/">
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
								<Button variant="ghost" size="sm" href={`/events/${event.id}/appel`}>
									<Eye class="mr-2 h-4 w-4" />
									Consulter
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
			<Archive class="mx-auto h-12 w-12 text-muted" />
			<h3 class="mt-4 text-lg font-bold uppercase">Historique vide</h3>
			<p class="mt-1 text-sm font-bold text-muted-foreground uppercase">
				Aucun événement passé n'a été trouvé.
			</p>
		</div>
	{/if}
</div>
