<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { TimePicker } from '$lib/components/ui/time-picker';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { parseDate, type DateValue } from '@internationalized/date';
  import type { StaffRole } from '@prisma/client';
  import { getStaffRoleLabel } from '$lib/domain/staff';

  type Interviewer = {
    id: string;
    name: string;
    role: StaffRole;
  };

  type Props = {
    open: boolean;
    interview: {
      id: string;
      date: Date | string;
      staffId: string;
      talent: { nom: string; prenom: string };
    } | null;
    interviewers: Interviewer[];
    timezone: string;
  };

  let {
    open = $bindable(),
    interview,
    interviewers,
    timezone,
  }: Props = $props();

  let saving = $state(false);
  let selectedStaffId = $state('');
  let date = $state<DateValue | undefined>(undefined);
  let time = $state('');

  // The Select trigger needs the matching label for its current value;
  // recompute whenever the picked staff or pool changes.
  let selectedStaffLabel = $derived(
    interviewers.find((p) => p.id === selectedStaffId)?.name ??
      'Choisir un interviewer',
  );

  $effect(() => {
    if (!interview) return;
    selectedStaffId = interview.staffId;
    const d =
      interview.date instanceof Date
        ? interview.date
        : new Date(interview.date);
    // ISO yyyy-mm-dd in the campus TZ → CalendarDate via parseDate.
    const fr = new Intl.DateTimeFormat('fr-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    date = parseDate(fr);
    time = new Intl.DateTimeFormat('fr-FR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="font-heading text-lg tracking-wide uppercase">
        Réassigner l'entretien
      </Dialog.Title>
      <Dialog.Description>
        {#if interview}
          {interview.talent.prenom} {interview.talent.nom}
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if interview}
      <form
        action="?/reassignInterview"
        method="POST"
        class="space-y-4"
        use:enhance={() => {
          saving = true;
          return async ({ result, update }) => {
            saving = false;
            if (result.type === 'success') {
              toast.success('Entretien réassigné');
              open = false;
              await update();
            } else if (result.type === 'failure' && result.status === 409) {
              toast.error(
                (result.data as { message?: string })?.message ??
                  'Conflit de créneau',
              );
            } else {
              toast.error('Échec de la réassignation');
            }
          };
        }}
      >
        <input type="hidden" name="interviewId" value={interview.id} />
        <input type="hidden" name="staffId" value={selectedStaffId} />

        <div class="space-y-2">
          <Label class="text-xs font-bold uppercase">Interviewer</Label>
          <Select.Root
            type="single"
            value={selectedStaffId}
            onValueChange={(v) => (selectedStaffId = v)}
          >
            <Select.Trigger class="w-full">
              {selectedStaffLabel}
            </Select.Trigger>
            <Select.Content>
              {#each interviewers as person (person.id)}
                <Select.Item value={person.id}>
                  <span class="flex items-center gap-2">
                    <span>{person.name}</span>
                    <span
                      class="rounded-sm bg-muted px-1 py-0.5 font-mono text-[9px] tracking-widest text-muted-foreground uppercase"
                    >
                      {getStaffRoleLabel(person.role)}
                    </span>
                  </span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2">
            <Label class="text-xs font-bold uppercase">Date</Label>
            <DatePicker bind:value={date} name="date" />
          </div>
          <div class="space-y-2">
            <Label for="reassign-time" class="text-xs font-bold uppercase">
              Heure
            </Label>
            <TimePicker
              id="reassign-time"
              name="time"
              bind:value={time}
              required
            />
          </div>
        </div>

        <Dialog.Footer class="pt-2">
          <Button
            type="button"
            variant="outline"
            onclick={() => (open = false)}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={saving || !selectedStaffId || !date || !time}
            class="bg-epi-blue text-white hover:bg-epi-blue/90"
          >
            {saving ? 'Enregistrement...' : 'Réassigner'}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
