<script lang="ts">
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import SquareCheck from '@lucide/svelte/icons/square-check';
  import Star from '@lucide/svelte/icons/star';
  import Minus from '@lucide/svelte/icons/minus';
  import AlignLeft from '@lucide/svelte/icons/align-left';
  import ContactRound from '@lucide/svelte/icons/contact-round';
  import * as Select from '$lib/components/ui/select';
  import type { QuestionType } from '../editor.svelte';

  let {
    value,
    disabled = false,
    onChange,
  }: {
    value: QuestionType;
    disabled?: boolean;
    onChange: (t: QuestionType) => void;
  } = $props();

  const TYPES = [
    { value: 'single', label: 'Choix unique', icon: CircleDot },
    { value: 'multiple', label: 'Choix multiple', icon: SquareCheck },
    { value: 'scale', label: 'Échelle', icon: Star },
    { value: 'text', label: 'Texte court', icon: Minus },
    { value: 'textarea', label: 'Texte long', icon: AlignLeft },
    { value: 'gate', label: 'Aiguillage coordonnées', icon: ContactRound },
  ] as const;

  const current = $derived(TYPES.find((t) => t.value === value) ?? TYPES[0]);
  const CurrentIcon = $derived(current.icon);
</script>

<Select.Root
  type="single"
  {value}
  {disabled}
  onValueChange={(v) => v && v !== value && onChange(v as QuestionType)}
>
  <Select.Trigger class="h-9 w-52 rounded-sm">
    <span class="flex items-center gap-2">
      <CurrentIcon class="h-4 w-4 text-muted-foreground" />
      {current.label}
    </span>
  </Select.Trigger>
  <Select.Content>
    {#each TYPES as t (t.value)}
      {@const Icon = t.icon}
      <Select.Item value={t.value}>
        <span class="flex items-center gap-2">
          <Icon class="h-4 w-4 text-muted-foreground" />
          {t.label}
        </span>
      </Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
