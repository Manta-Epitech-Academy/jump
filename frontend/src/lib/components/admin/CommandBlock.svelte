<script lang="ts">
  /**
   * One copyable command or config snippet.
   *
   * Everything a person has to paste into a terminal goes through this: the
   * label, the monospace block and the copy button are the same three parts
   * every time, so a second spelling of them would be a second chance to forget
   * the `overflow-x-auto`.
   *
   * A command does not wrap. `AGENTS.md` reserves horizontal overflow for
   * tables, diagrams and code blocks, in their own container, and a wrapped
   * command is worse than a scrolling one: it reads as two commands.
   */
  import CopyButton from '$lib/components/ui/CopyButton.svelte';

  type Props = {
    label: string;
    value: string;
    copyLabel?: string;
    /** A config file is read as a block, a command as one line. */
    multiline?: boolean;
  };

  let { label, value, copyLabel, multiline = false }: Props = $props();
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between gap-2">
    <p class="text-xs font-medium text-muted-foreground">{label}</p>
    <CopyButton {value} label={copyLabel ?? `Copier : ${label}`} />
  </div>
  <pre
    class="overflow-x-auto rounded-sm border border-border bg-muted px-3 py-2 font-mono text-xs
      {multiline ? '' : 'whitespace-pre'}">{value}</pre>
</div>
