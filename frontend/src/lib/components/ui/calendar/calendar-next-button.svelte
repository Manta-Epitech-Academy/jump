<script lang="ts">
  import { Calendar as CalendarPrimitive } from 'bits-ui';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import {
    buttonVariants,
    type ButtonVariant,
  } from '#lib/components/ui/button/index.ts';
  import { cn } from '#lib/utils.ts';

  let {
    ref = $bindable(null),
    class: className,
    children,
    variant = 'ghost',
    ...restProps
  }: CalendarPrimitive.NextButtonProps & {
    variant?: ButtonVariant;
  } = $props();
</script>

{#snippet Fallback()}
  <ChevronRightIcon class="size-4" />
{/snippet}

<CalendarPrimitive.NextButton
  bind:ref
  class={cn(
    buttonVariants({ variant }),
    'pointer-events-auto size-(--cell-size) bg-transparent p-0 select-none disabled:opacity-50 rtl:rotate-180',
    className,
  )}
  children={children || Fallback}
  {...restProps}
/>
