<script lang="ts">
  import { Mail, Phone, Users } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import StudentIdentityCard from '$lib/components/students/StudentIdentityCard.svelte';

  let {
    student,
    stats,
    xpProgress,
    sortedThemes,
  }: {
    student: any;
    stats: { totalEvents: number; presentCount: number; lateCount: number };
    xpProgress: number;
    sortedThemes: [string, number][];
  } = $props();

  const email = $derived(student.user?.email || student.email);
</script>

<StudentIdentityCard
  {student}
  {stats}
  {xpProgress}
  accent="blue"
  afterIdentity={contact}
  beforeStats={competences}
/>

{#snippet contact()}
  <div class="flex flex-col gap-2 text-sm text-muted-foreground">
    {#if email}
      <a
        href={`mailto:${email}`}
        class="flex items-center gap-2 transition-colors hover:text-epi-blue"
      >
        <Mail class="h-3.5 w-3.5" /><span class="truncate">{email}</span>
      </a>
    {/if}
    {#if student.phone}
      <a
        href={`tel:${student.phone.replace(/\s+/g, '')}`}
        class="flex items-center gap-2 transition-colors hover:text-epi-blue"
      >
        <Phone class="h-3.5 w-3.5" /><span>{student.phone}</span>
      </a>
    {/if}

    {#if student.parentEmail || student.parentPhone}
      <Separator class="my-1" />
      <div
        class="flex flex-col gap-1.5 rounded-md border border-muted/50 bg-muted/20 p-2"
      >
        <span
          class="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase"
          ><Users class="h-3 w-3" /> Contact Parent</span
        >
        {#if student.parentEmail}
          <a
            href={`mailto:${student.parentEmail}`}
            class="flex items-center gap-2 text-xs transition-colors hover:text-epi-blue"
          >
            <Mail class="h-3 w-3" /><span class="truncate"
              >{student.parentEmail}</span
            >
          </a>
        {/if}
        {#if student.parentPhone}
          <a
            href={`tel:${student.parentPhone.replace(/\s+/g, '')}`}
            class="flex items-center gap-2 text-xs transition-colors hover:text-epi-blue"
          >
            <Phone class="h-3 w-3" /><span>{student.parentPhone}</span>
          </a>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet competences()}
  <div class="space-y-2">
    <div
      class="text-center text-[10px] font-black tracking-widest text-muted-foreground uppercase"
    >
      Top Compétences
    </div>
    <div class="flex flex-wrap justify-center gap-2">
      {#each sortedThemes.slice(0, 4) as [theme, count]}
        <Badge
          variant="secondary"
          class="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
        >
          #{theme} ({count})
        </Badge>
      {:else}
        <span class="text-xs text-muted-foreground italic">Aucune donnée</span>
      {/each}
    </div>
  </div>
{/snippet}
