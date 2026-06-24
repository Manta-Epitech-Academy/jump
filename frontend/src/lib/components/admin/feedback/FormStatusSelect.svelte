<script lang="ts">
  import * as Select from '$lib/components/ui/select';
  import { cn } from '$lib/utils';
  import WidestLabel from '$lib/components/staff/WidestLabel.svelte';
  import {
    FORM_STATUS_LABELS,
    FORM_STATUS_OPTIONS,
    FORM_STATUS_BADGE_CLASS,
    type FormStatusValue,
  } from '$lib/domain/feedbackForms/status';

  // Coloured status pill that IS a real Select: same primitive, cursor, chevron
  // and check-mark selection as every other select in the app (it replaced a
  // bespoke DropdownMenu whose radio dot, missing cursor and fixed-width panel
  // read as a one-off). The trigger hugs its widest option via WidestLabel, so it
  // stays badge-tight and never jumps when the status changes.
  let {
    value,
    onChange,
    disabled = false,
  }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  } = $props();

  const status = $derived(value as FormStatusValue);
</script>

<Select.Root type="single" {value} {disabled} onValueChange={onChange}>
  <Select.Trigger
    size="sm"
    aria-label="Changer le statut"
    class={cn(
      'gap-1 rounded-sm border-0 px-2 text-xs font-medium shadow-none',
      FORM_STATUS_BADGE_CLASS[status],
    )}
  >
    <WidestLabel
      labels={FORM_STATUS_OPTIONS.map((o) => o.label)}
      selected={FORM_STATUS_LABELS[status]}
    />
  </Select.Trigger>
  <Select.Content align="start">
    {#each FORM_STATUS_OPTIONS as opt (opt.value)}
      <Select.Item value={opt.value}>{opt.label}</Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
