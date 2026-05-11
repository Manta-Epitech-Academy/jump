<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import Users from '@lucide/svelte/icons/users';
  import * as Card from '$lib/components/ui/card';
  import { Separator } from '$lib/components/ui/separator';

  type Student = {
    email?: string | null;
    user?: { email?: string | null } | null;
    phone?: string | null;
    parentNom?: string | null;
    parentPrenom?: string | null;
    parentEmail?: string | null;
    parentPhone?: string | null;
  };

  let { student }: { student: Student } = $props();

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

<Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
  <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <Mail class="h-4 w-4 text-epi-blue" />
      Coordonnées
    </Card.Title>
  </Card.Header>
  <Card.Content class="space-y-4 pt-5">
    <div class="space-y-2">
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Élève
      </h4>
      {#if studentEmail}
        <a
          href={`mailto:${studentEmail}`}
          class="group flex items-center gap-2 text-sm transition-colors hover:text-epi-blue"
        >
          <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="truncate">{studentEmail}</span>
        </a>
      {:else}
        <p class="flex items-center gap-2 text-sm text-muted-foreground italic">
          <Mail class="h-4 w-4 shrink-0" />
          Aucun email
        </p>
      {/if}
      {#if student.phone}
        <a
          href={`tel:${student.phone.replace(/\s+/g, '')}`}
          class="group flex items-center gap-2 text-sm transition-colors hover:text-epi-blue"
        >
          <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{student.phone}</span>
        </a>
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
          <a
            href={`mailto:${student.parentEmail}`}
            class="group flex items-center gap-2 text-sm transition-colors hover:text-epi-blue"
          >
            <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="truncate">{student.parentEmail}</span>
          </a>
        {/if}
        {#if student.parentPhone}
          <a
            href={`tel:${student.parentPhone.replace(/\s+/g, '')}`}
            class="group flex items-center gap-2 text-sm transition-colors hover:text-epi-blue"
          >
            <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{student.parentPhone}</span>
          </a>
        {/if}
      {/if}
    </div>
  </Card.Content>
</Card.Root>
