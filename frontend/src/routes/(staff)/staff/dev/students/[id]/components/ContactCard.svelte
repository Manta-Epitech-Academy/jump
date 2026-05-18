<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import Users from '@lucide/svelte/icons/users';
  import Fingerprint from '@lucide/svelte/icons/fingerprint';
  import Cloud from '@lucide/svelte/icons/cloud';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Pencil from '@lucide/svelte/icons/pencil';
  import { Separator } from '$lib/components/ui/separator';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { salesforceContactUrl } from '$lib/domain/salesforce';

  type Student = {
    id: string;
    externalId?: string | null;
    discordId?: string | null;
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

  // Short identifier — keep the prefix that's most meaningful when staff
  // copy/paste between Jump and Salesforce.
  const shortId = $derived(student.id.slice(0, 8).toUpperCase());
</script>

<EpiSection overline="Contacts" title="Coordonnées" accent="blue">
  {#snippet meta()}
    {#if onEdit}
      <button
        type="button"
        onclick={onEdit}
        class="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-epi-blue"
        aria-label="Modifier le profil"
        title="Modifier le profil"
      >
        <Pencil class="h-3.5 w-3.5" />
      </button>
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

    <Separator />

    <div class="space-y-2">
      <h4
        class="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        <Fingerprint class="h-3 w-3" />
        Identifiants
      </h4>
      <div class="flex items-center gap-2 text-sm" title={student.id}>
        <Fingerprint class="h-4 w-4 shrink-0 text-muted-foreground" />
        <span class="font-mono text-xs">Jump · {shortId}</span>
      </div>
      {#if student.externalId}
        <a
          href={salesforceContactUrl(student.externalId)}
          target="_blank"
          rel="noopener noreferrer"
          class="group flex items-center gap-2 text-sm transition-colors hover:text-epi-blue"
        >
          <Cloud class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="font-mono text-xs"
            >Salesforce · {student.externalId}</span
          >
        </a>
      {/if}
      {#if student.discordId}
        <div class="flex items-center gap-2 text-sm">
          <MessageCircle class="h-4 w-4 shrink-0 text-muted-foreground" />
          <span class="font-mono text-xs">Discord · {student.discordId}</span>
        </div>
      {/if}
    </div>
  </div>
</EpiSection>
