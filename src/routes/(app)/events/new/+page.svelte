<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { buttonVariants, Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Card from '$lib/components/ui/card';
	import * as Popover from '$lib/components/ui/popover';
	import Calendar from '$lib/components/ui/calendar/calendar.svelte';
	import { ChevronLeft, Save, ChevronDown } from 'lucide-svelte';
	import { CalendarDateTime, getLocalTimeZone, today } from '@internationalized/date';
	import { untrack } from 'svelte';
	import { formatDateFr } from '$lib/utils';
	import ThemeSelect from '$lib/components/ThemeSelect.svelte';

	let { data }: { data: PageData } = $props();

	const { form, errors, delayed, enhance } = superForm(untrack(() => data.form));

	let open = $state(false);
	let dateValue = $state<CalendarDateTime | undefined>();

	const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
	const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

	let hour = $state('14');
	let minute = $state('00');
	let timeValue = $state('14:00');

	$effect(() => {
		if (dateValue) {
			$form.date = dateValue;
		}
		timeValue = `${hour}:${minute}`;
		$form.time = timeValue;
	});
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-4">
		<a href="/" class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
			<ChevronLeft class="h-4 w-4" />
		</a>
		<h1 class="text-3xl font-bold text-epi-blue uppercase">
			Nouvel Événement<span class="text-epi-teal">_</span>
		</h1>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Configuration</Card.Title>
			<Card.Description>Définissez les informations générales de l'événement.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST" use:enhance id="event-form" class="space-y-6">
				<div class="space-y-2">
					<Label for="titre">Titre de l'événement</Label>
					<Input
						id="titre"
						name="titre"
						bind:value={$form.titre}
						placeholder="Ex: Atelier hebdomadaire - Mercredi"
					/>
					{#if $errors.titre}<p class="text-sm text-destructive">{$errors.titre}</p>{/if}
				</div>

				<div class="flex gap-4">
					<div class="flex-1 space-y-2">
						<Label for="date">Date</Label>
						<Popover.Root bind:open>
							<Popover.Trigger id="date">
								{#snippet child({ props })}
									<Button {...props} variant="outline" class="w-full justify-between font-normal">
										{formatDateFr(dateValue)}
										<ChevronDown class="h-4 w-4" />
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content class="w-auto overflow-hidden p-0" align="start">
								<Calendar
									type="single"
									bind:value={dateValue}
									captionLayout="dropdown"
									onValueChange={() => {
										open = false;
									}}
									minValue={today(getLocalTimeZone())}
								/>
							</Popover.Content>
						</Popover.Root>
						<input
							type="hidden"
							name="date"
							value={dateValue
								? `${dateValue.year}-${String(dateValue.month).padStart(2, '0')}-${String(dateValue.day).padStart(2, '0')}`
								: ''}
						/>
						{#if $errors.date}<p class="text-sm text-destructive">{$errors.date}</p>{/if}
					</div>

					<div class="flex-1 space-y-2">
						<Label>Heure</Label>
						<div class="flex gap-2">
							<Select.Root type="single" bind:value={hour}>
								<Select.Trigger class="w-full">{hour}</Select.Trigger>
								<Select.Content class="h-[200px] overflow-y-auto">
									{#each hours as h (h)}<Select.Item value={h}>{h}</Select.Item>{/each}
								</Select.Content>
							</Select.Root>
							<span class="py-2 text-muted-foreground">:</span>
							<Select.Root type="single" bind:value={minute}>
								<Select.Trigger class="w-full">{minute}</Select.Trigger>
								<Select.Content>
									{#each minutes as m (m)}<Select.Item value={m}>{m}</Select.Item>{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<input type="hidden" name="time" value={timeValue} />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="theme">Thème (Optionnel)</Label>
					<ThemeSelect themes={data.themes} bind:value={$form.theme} name="theme" />
					<p class="text-[10px] font-bold text-muted-foreground uppercase">
						Sélectionnez un thème existant ou tapez-en un nouveau pour le créer.
					</p>
					{#if $errors.theme}<p class="text-sm text-destructive">{$errors.theme}</p>{/if}
				</div>
				<input type="hidden" name="statut" value="planifiee" />
			</form>
		</Card.Content>
		<Card.Footer class="justify-end border-t bg-muted/50 px-6 py-4">
			<button type="submit" form="event-form" class={buttonVariants()} disabled={$delayed}>
				<Save class="mr-2 h-4 w-4" />
				{#if $delayed}Création...{:else}Créer l'événement{/if}
			</button>
		</Card.Footer>
	</Card.Root>
</div>
