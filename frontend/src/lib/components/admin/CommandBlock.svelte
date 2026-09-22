<script lang="ts">
  /**
   * One copyable command or config snippet.
   *
   * Everything a person has to paste into a terminal goes through this: the
   * label, the monospace block and the copy button are the same three parts
   * every time, so a second spelling of them would be a second chance to forget
   * the `overflow-x-auto`.
   *
   * A command does not wrap, which is what the `overflow-x-auto` buys: a
   * wrapped command reads as two commands, and somebody pastes half of it. A
   * `<pre>` already refuses to wrap on its own, so the rule here is the
   * container, not a whitespace class.
   */
  import CopyButton from '$lib/components/ui/CopyButton.svelte';

  type Props = {
    label: string;
    value: string;
    copyLabel?: string;
  };

  let { label, value, copyLabel }: Props = $props();
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between gap-2">
    <p class="text-xs font-medium text-muted-foreground">{label}</p>
    <CopyButton {value} label={copyLabel ?? `Copier : ${label}`} />
  </div>
  <pre
    class="overflow-x-auto rounded-sm border border-border bg-muted px-3 py-2 font-mono text-xs">{value}</pre>
</div>
