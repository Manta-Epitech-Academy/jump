<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { CircleCheck, Save, Trophy, User } from 'lucide-svelte';
	import { fly } from 'svelte/transition';

	let {
		participation = $bindable(),
		optimisticToggle
	}: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		participation: any;
		// Accepts the curried function from the parent
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		optimisticToggle: (id: string, field: 'is_present' | 'is_validated') => any;
	} = $props();

	function formatFirstName(name: string | undefined) {
		if (!name) return '';
		return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
	}
</script>

<div transition:fly={{ y: 10, duration: 200 }}>
	<Card.Root
		class="overflow-hidden border-2 shadow-sm transition-all duration-200 {participation.is_validated
			? 'border-epi-teal bg-white'
			: participation.is_present
				? 'border-epi-blue bg-white'
				: 'border-transparent opacity-80'}"
	>
		<Card.Content class="flex flex-col gap-4 p-4">
			<div class="flex w-full items-center justify-between">
				<div class="flex flex-1 items-center gap-4">
					<div class="relative">
						<Avatar.Root
							class="h-12 w-12 rounded-sm border-2 {participation.is_present
								? 'border-epi-blue'
								: 'border-gray-200'}"
						>
							<Avatar.Fallback class="bg-gray-50 font-bold">
								{(participation.expand?.student?.prenom?.[0] ?? '').toUpperCase()}
								{(participation.expand?.student?.nom?.[0] ?? '').toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
						{#if participation.is_validated}
							<div
								class="absolute -right-1 -bottom-1 rounded-full bg-epi-teal p-0.5 text-black ring-2 ring-white"
							>
								<CircleCheck class="h-3 w-3" />
							</div>
						{/if}
					</div>
					<div class="flex flex-col">
						<span class="text-base leading-none font-bold">
							{formatFirstName(participation.expand?.student?.prenom)}
							<span class="uppercase">{participation.expand?.student?.nom}</span>
						</span>
						<span class="mt-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
							{participation.expand?.student?.niveau}
						</span>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<!-- Present Toggle -->
					<form
						method="POST"
						action="?/togglePresent"
						use:enhance={optimisticToggle(participation.id, 'is_present')}
					>
						<input type="hidden" name="id" value={participation.id} />
						<input type="hidden" name="state" value={participation.is_present.toString()} />
						<Button
							type="submit"
							variant={participation.is_present ? 'default' : 'outline'}
							size="icon"
							class="h-12 w-12 rounded-sm transition-all {participation.is_present
								? 'bg-epi-blue'
								: 'text-gray-400 hover:text-epi-blue'}"
						>
							<User class="h-6 w-6" />
						</Button>
					</form>

					<!-- Validated Toggle -->
					<form
						method="POST"
						action="?/toggleValidated"
						use:enhance={optimisticToggle(participation.id, 'is_validated')}
					>
						<input type="hidden" name="id" value={participation.id} />
						<input type="hidden" name="state" value={participation.is_validated.toString()} />
						<Button
							type="submit"
							variant={participation.is_validated ? 'default' : 'outline'}
							size="icon"
							disabled={!participation.is_present}
							class="h-12 w-12 rounded-sm transition-all {participation.is_validated
								? 'bg-epi-teal text-black hover:bg-epi-teal'
								: 'text-gray-400 hover:text-epi-teal'}"
						>
							<Trophy class="h-6 w-6" />
						</Button>
					</form>
				</div>
			</div>

			{#if participation.is_present}
				<div class="border-t pt-2">
					<form action="?/updateNote" method="POST" use:enhance class="flex items-center gap-2">
						<input type="hidden" name="id" value={participation.id} />
						<Input
							name="note"
							value={participation.note}
							placeholder="Observation (ex: Difficultés sur les boucles...)"
							class="focus:border-input h-8 border-transparent bg-gray-50 text-xs transition-colors focus:bg-white"
						/>
						<Button type="submit" variant="ghost" size="icon" class="h-8 w-8">
							<Save class="h-3 w-3 text-muted-foreground" />
						</Button>
					</form>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
