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
  import { m } from '$lib/paraglide/messages.js';
  import { i18nHref } from '$lib/utils';
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
      title = `${eventToDuplicate.titre} (${m.event_duplicate_copy_suffix()})`;

      const sourceDate = new Date(eventToDuplicate.date);
      const h = sourceDate.getHours();
      const min = sourceDate.getMinutes();

      const tomorrow = today(getLocalTimeZone()).add({ days: 1 });

      dateValue = new CalendarDateTime(
        tomorrow.year,
        tomorrow.month,
        tomorrow.day,
        h,
        min,
      );
      hour = String(h).padStart(2, '0');
      minute = String(min).padStart(2, '0');
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-106.25">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Copy class="h-5 w-5 text-epi-blue" />
        {m.event_duplicate_title()}
      </Dialog.Title>
      <Dialog.Description>
        {m.event_duplicate_description()}
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

              toast.success(m.event_duplicate_success(), {
                duration: 5000,
                action: {
                  label: m.event_duplicate_open_builder(),
                  onClick: () => goto(i18nHref(`/events/${newId}/builder`)),
                },
              });

              open = false;
              await update();
            } else {
              toast.error(m.event_duplicate_error());
              await update();
            }
          };
        }}
        class="grid gap-4 py-4"
      >
        <input type="hidden" name="originalId" value={eventToDuplicate.id} />

        <div class="grid gap-2">
          <Label for="titre">{m.event_label_title()}</Label>
          <Input id="titre" name="titre" bind:value={title} required />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>{m.event_label_date()}</Label>
            <DatePicker bind:value={dateValue} name="date" />
          </div>
          <div class="space-y-2">
            <Label>{m.event_label_time()}</Label>
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
            >{m.common_cancel()}</Button
          >
          <Button
            type="submit"
            disabled={isLoading}
            class="bg-epi-blue text-white"
          >
            {#if isLoading}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
              {m.common_creating()}
            {:else}
              {m.event_dropdown_duplicate()}
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
