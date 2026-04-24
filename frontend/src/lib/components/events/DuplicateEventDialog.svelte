<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Copy, LoaderCircle } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import {
    CalendarDateTime,
    getLocalTimeZone,
    today,
  } from '@internationalized/date';
  import * as Select from '$lib/components/ui/select';

  let {
    open = $bindable(false),
    eventToDuplicate,
  }: {
    open: boolean;
    eventToDuplicate: { id: string; titre: string; date: Date } | null;
  } = $props();

  let isLoading = $state(false);

  // Default values logic
  let title = $state('');
  let dateValue = $state<CalendarDateTime | undefined>();
  let hour = $state('09');
  let minute = $state('00');

  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, '0'),
  );
  const minutes = Array.from({ length: 12 }, (_, i) =>
    String(i * 5).padStart(2, '0'),
  );

  // Reset form when modal opens with a new event
  $effect(() => {
    if (open && eventToDuplicate) {
      title = `${eventToDuplicate.titre} (Copie)`;

      const sourceDate = new Date(eventToDuplicate.date);
      const h = sourceDate.getHours();
      const m = sourceDate.getMinutes();

      const tomorrow = today(getLocalTimeZone()).add({ days: 1 });

      dateValue = new CalendarDateTime(
        tomorrow.year,
        tomorrow.month,
        tomorrow.day,
        h,
        m,
      );
      hour = String(h).padStart(2, '0');
      minute = String(m).padStart(2, '0');
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-106.25">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Copy class="h-5 w-5 text-epi-blue" />
        Dupliquer l'événement
      </Dialog.Title>
      <Dialog.Description>
        Configurez la copie de l'événement. Les participants seront copiés mais
        leur statut (présence, note) sera réinitialisé.
      </Dialog.Description>
    </Dialog.Header>

    {#if eventToDuplicate}
      <form
        action="?/duplicateEvent"
        method="POST"
        use:enhance={() => {
          isLoading = true;
          return async ({ result, update }) => {
            isLoading = false;
            if (result.type === 'success') {
              const newId = result.data?.newEventId;

              toast.success('Événement dupliqué !', {
                duration: 5000,
                action: {
                  label: 'Ouvrir le Builder',
                  onClick: () =>
                    goto(resolve(`/staff/dev/events/${newId}/manage`)),
                },
              });

              open = false;
              await update();
            } else {
              toast.error('Erreur lors de la duplication');
              await update();
            }
          };
        }}
        class="grid gap-4 py-4"
      >
        <input type="hidden" name="originalId" value={eventToDuplicate.id} />

        <div class="grid gap-2">
          <Label for="titre">Titre</Label>
          <Input id="titre" name="titre" bind:value={title} required />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>Date</Label>
            <DatePicker bind:value={dateValue} name="date" />
          </div>
          <div class="space-y-2">
            <Label>Heure</Label>
            <div class="flex gap-2">
              <Select.Root type="single" bind:value={hour}>
                <Select.Trigger>{hour}</Select.Trigger>
                <Select.Content class="max-h-40">
                  {#each hours as h}<Select.Item value={h}>{h}</Select.Item
                    >{/each}
                </Select.Content>
              </Select.Root>
              <Select.Root type="single" bind:value={minute}>
                <Select.Trigger>{minute}</Select.Trigger>
                <Select.Content>
                  {#each minutes as m}<Select.Item value={m}>{m}</Select.Item
                    >{/each}
                </Select.Content>
              </Select.Root>
            </div>
            <!-- Combine for server -->
            <input type="hidden" name="time" value={`${hour}:${minute}`} />
          </div>
        </div>

        <Dialog.Footer>
          <Button type="button" variant="ghost" onclick={() => (open = false)}
            >Annuler</Button
          >
          <Button
            type="submit"
            disabled={isLoading}
            class="bg-epi-blue text-white"
          >
            {#if isLoading}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
              Création...
            {:else}
              Dupliquer
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
