<script lang="ts">
  import { TimeField, type TimeSegmentPart } from 'bits-ui';
  import { cn } from '$lib/utils';

  let {
    class: className,
    segment,
  }: {
    class?: string;
    segment: { part: TimeSegmentPart; value: string };
  } = $props();
</script>

<TimeField.Segment
  part={segment.part}
  class={cn(
    'inline rounded p-0.5 text-foreground caret-transparent outline-hidden focus:bg-accent focus:text-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-[valuetext=Empty]:text-muted-foreground/70 focus:aria-[valuetext=Empty]:text-foreground data-invalid:text-destructive focus:data-invalid:bg-destructive focus:data-invalid:text-white data-invalid:aria-[valuetext=Empty]:text-destructive focus:data-invalid:aria-[valuetext=Empty]:text-white data-[segment=literal]:px-0 data-[segment=literal]:text-muted-foreground/70',
    className,
  )}
>
  {segment.value}
</TimeField.Segment>
