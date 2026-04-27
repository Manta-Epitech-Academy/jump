<script lang="ts">
  import { Mail, Phone, Users, Pencil, ExternalLink } from '@lucide/svelte';
  import { Separator } from '$lib/components/ui/separator';
  import { Button } from '$lib/components/ui/button';
  import StudentIdentityCard from '$lib/components/students/StudentIdentityCard.svelte';

  let {
    student,
    stats,
    xpProgress,
    onOpenEdit,
  }: {
    student: any;
    stats: { presentCount: number; lateCount: number };
    xpProgress: number;
    onOpenEdit: () => void;
  } = $props();

  const email = $derived(student.user?.email || student.email);
</script>

<StudentIdentityCard
  {student}
  {stats}
  {xpProgress}
  accent="blue"
  afterIdentity={contact}
  footer={editButton}
/>

{#snippet contact()}
  <div class="flex flex-col gap-2.5 text-sm font-medium text-foreground">
    {#if email}
      <a
        href={`mailto:${email}`}
        class="group flex items-center gap-2 transition-colors hover:text-epi-blue"
      >
        <Mail class="h-4 w-4 text-muted-foreground" /><span class="truncate"
          >{email}</span
        >
        <ExternalLink
          class="h-3 w-3 text-epi-blue opacity-0 transition-opacity group-hover:opacity-100"
        />
      </a>
    {/if}
    {#if student.phone}
      <a
        href={`tel:${student.phone.replace(/\s+/g, '')}`}
        class="group flex items-center gap-2 transition-colors hover:text-epi-blue"
      >
        <Phone class="h-4 w-4 text-muted-foreground" /><span
          >{student.phone}</span
        >
        <ExternalLink
          class="h-3 w-3 text-epi-blue opacity-0 transition-opacity group-hover:opacity-100"
        />
      </a>
    {/if}

    {#if student.parentEmail || student.parentPhone}
      <Separator class="my-2" />
      <div class="flex flex-col gap-2 rounded-sm border bg-muted/10 p-3">
        <span
          class="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          ><Users class="h-3.5 w-3.5" /> Responsable Légal</span
        >
        {#if student.parentEmail}
          <a
            href={`mailto:${student.parentEmail}`}
            class="flex items-center gap-2 text-xs transition-colors hover:text-epi-blue"
          >
            <Mail class="h-3.5 w-3.5 text-muted-foreground" /><span
              class="truncate">{student.parentEmail}</span
            >
          </a>
        {/if}
        {#if student.parentPhone}
          <a
            href={`tel:${student.parentPhone.replace(/\s+/g, '')}`}
            class="flex items-center gap-2 text-xs transition-colors hover:text-epi-blue"
          >
            <Phone class="h-3.5 w-3.5 text-muted-foreground" /><span
              >{student.parentPhone}</span
            >
          </a>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet editButton()}
  <Button variant="outline" class="mt-2 w-full rounded-sm" onclick={onOpenEdit}
    ><Pencil class="mr-2 h-4 w-4" /> Modifier le profil CRM</Button
  >
{/snippet}
