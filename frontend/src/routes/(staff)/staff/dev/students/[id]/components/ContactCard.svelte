<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import Users from '@lucide/svelte/icons/users';
  import Pencil from '@lucide/svelte/icons/pencil';
  import { Separator } from '$lib/components/ui/separator';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  type Student = {
    id: string;
    email?: string | null;
    user?: { email?: string | null } | null;
    phone?: string | null;
    parentNom?: string | null;
    parentPrenom?: string | null;
    parentEmail?: string | null;
    parentPhone?: string | null;
  };

  let { student, onEdit }: { student: Student; onEdit?: () => void } = $props();

  const studentEmail = $derived(student.user?.email || student.email);
  const parentLine = $derived(
    [student.parentPrenom, student.parentNom].filter(Boolean).join(' ').trim(),
  );

  const hasParentContact = $derived(
    Boolean(
      student.parentEmail ||
      student.parentPhone ||
      student.parentNom ||
      student.parentPrenom,
    ),
  );
</script>

<EpiSection title="Coordonnées" accent="blue">
  {#snippet meta()}
    {#if onEdit}
      <Tooltip.Provider delayDuration={200}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                onclick={onEdit}
                class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-epi-blue"
                aria-label="Modifier le profil"
              >
                <Pencil class="h-3.5 w-3.5" />
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content><p>Modifier le profil</p></Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    {/if}
  {/snippet}

  <div class="space-y-4">
    <div class="space-y-2">
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Élève
      </h4>
      {#if studentEmail}
        <div class="flex items-center gap-1">
          <a
            href={`mailto:${studentEmail}`}
            class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
          >
            <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="truncate">{studentEmail}</span>
          </a>
          <CopyButton value={studentEmail} label="Copier l'email" />
        </div>
      {:else}
        <p class="flex items-center gap-2 text-sm text-muted-foreground italic">
          <Mail class="h-4 w-4 shrink-0" />
          Aucun email
        </p>
      {/if}
      {#if student.phone}
        <div class="flex items-center gap-1">
          <a
            href={`tel:${student.phone.replace(/\s+/g, '')}`}
            class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
          >
            <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{student.phone}</span>
          </a>
          <CopyButton value={student.phone} label="Copier le téléphone" />
        </div>
      {:else}
        <p class="flex items-center gap-2 text-sm text-muted-foreground italic">
          <Phone class="h-4 w-4 shrink-0" />
          Aucun téléphone
        </p>
      {/if}
    </div>

    <Separator />

    <div class="space-y-2">
      <h4
        class="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        <Users class="h-3 w-3" />
        Responsable légal
      </h4>
      {#if !hasParentContact}
        <p class="text-sm text-muted-foreground italic">
          Aucune information renseignée
        </p>
      {:else}
        {#if parentLine}
          <p class="text-sm font-medium">{parentLine}</p>
        {/if}
        {#if student.parentEmail}
          <div class="flex items-center gap-1">
            <a
              href={`mailto:${student.parentEmail}`}
              class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
            >
              <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span class="truncate">{student.parentEmail}</span>
            </a>
            <CopyButton
              value={student.parentEmail}
              label="Copier l'email parent"
            />
          </div>
        {/if}
        {#if student.parentPhone}
          <div class="flex items-center gap-1">
            <a
              href={`tel:${student.parentPhone.replace(/\s+/g, '')}`}
              class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
            >
              <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{student.parentPhone}</span>
            </a>
            <CopyButton
              value={student.parentPhone}
              label="Copier le téléphone parent"
            />
          </div>
        {/if}
      {/if}
    </div>
  </div>
</EpiSection>
