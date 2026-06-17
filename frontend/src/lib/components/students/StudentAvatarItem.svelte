<script lang="ts">
  import TalentAvatar from './TalentAvatar.svelte';
  import TalentName from './TalentName.svelte';

  let {
    student,
    subText = null,
    courtesyTitle = null,
    size = 'md',
  }: {
    student: {
      id: string;
      nom?: string | null;
      prenom?: string | null;
    };
    subText?: string | null;
    // Optional honorific (civilité) shown muted before the name, mirroring the
    // dossier ContactCard. Empty string / null omits it.
    courtesyTitle?: string | null;
    size?: 'sm' | 'md';
  } = $props();
</script>

<div class="flex items-center gap-3">
  <TalentAvatar talent={student} {size} />

  <div class="flex min-w-0 flex-col">
    <span
      class="group flex items-center gap-2 truncate text-sm font-bold transition-colors hover:text-epi-blue"
    >
      <span class="truncate">
        {#if courtesyTitle}<span class="font-normal text-muted-foreground"
            >{courtesyTitle}</span
          >{' '}{/if}<TalentName talent={student} />
      </span>
    </span>
    {#if subText}
      <span class="truncate text-xs text-muted-foreground">{subText}</span>
    {/if}
  </div>
</div>
