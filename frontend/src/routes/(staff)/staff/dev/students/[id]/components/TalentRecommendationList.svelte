<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import { formatPhoneForDisplay } from '$lib/domain/phone';
  import { cn } from '$lib/utils';
  import type {
    TalentRecommendation,
    TalentRecommendationContact,
  } from '$lib/domain/talentRecommendations';

  // Secondary, utilitarian panel: the suggested actions for this talent's current
  // state. Each row names the suggestion and, when it targets someone (parent or
  // talent), surfaces that person to reach as copyable email + phone — no
  // canned-relance button, the dev calls/writes themselves.
  type Contacts = {
    parentEmail: string | null;
    parentPhone: string | null;
    studentEmail: string | null;
    studentPhone: string | null;
  };

  let {
    recommendations,
    contacts,
  }: { recommendations: TalentRecommendation[]; contacts: Contacts } = $props();

  function contactFor(c: TalentRecommendationContact): {
    email: string | null;
    phone: string | null;
  } {
    if (c === 'parent')
      return { email: contacts.parentEmail, phone: contacts.parentPhone };
    if (c === 'student')
      return { email: contacts.studentEmail, phone: contacts.studentPhone };
    return { email: null, phone: null };
  }

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Render a recommendation message with `**…**` segments shown in bold (e.g.
  // the interest topic in REC-005). Text is escaped first — messages interpolate
  // the talent's first name — so the only markup reaching {@html} is our own
  // <strong> wrappers. Messages without `**` (REC-001..004) render verbatim.
  function boldify(message: string): string {
    return message
      .split('**')
      .map((seg, i) =>
        i % 2 === 1 ? `<strong>${escapeHtml(seg)}</strong>` : escapeHtml(seg),
      )
      .join('');
  }
</script>

{#snippet emailRow(email: string)}
  <span class="inline-flex min-w-0 items-center gap-1.5 text-sm">
    <Mail class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <a
      href={`mailto:${email}`}
      class="truncate transition-colors hover:text-epi-blue"
    >
      {email}
    </a>
    <CopyButton value={email} label="Copier l'email" />
  </span>
{/snippet}

{#snippet phoneRow(phone: string)}
  {@const display = formatPhoneForDisplay(phone) ?? phone}
  <span class="inline-flex items-center gap-1.5 text-sm">
    <Phone class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <a
      href={`tel:${phone.replace(/\s+/g, '')}`}
      class="tabular-nums transition-colors hover:text-epi-blue"
    >
      {display}
    </a>
    <CopyButton value={display} label="Copier le téléphone" />
  </span>
{/snippet}

{#if recommendations.length === 0}
  <div
    class="flex items-center gap-2 rounded-sm border border-dashed border-epi-teal/30 bg-epi-teal/5 px-4 py-3 text-sm text-epi-teal-solid"
  >
    <CircleCheck class="h-4 w-4 shrink-0" />
    Aucune recommandation, rien à signaler.
  </div>
{:else}
  <ul class="space-y-2">
    {#each recommendations as rec (rec.id)}
      {@const info = contactFor(rec.contact)}
      <li
        class="flex items-stretch gap-3 overflow-hidden rounded-sm border bg-card"
      >
        <span
          class={cn(
            'w-1 shrink-0',
            rec.severity === 'urgent' ? 'bg-epi-orange' : 'bg-epi-blue',
          )}
          aria-hidden="true"
        ></span>
        <div
          class="flex flex-1 flex-col gap-x-6 gap-y-2 py-2.5 pr-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="text-sm">
              <span class="font-bold">{rec.shortTitle} :{' '}</span
              >{@html boldify(rec.message)}
            </p>
          </div>

          {#if rec.contact}
            <!-- The person the dev reaches out to, beside the recommendation.
                 An opportunity surfaces every channel (email then phone); a
                 funnel nudge wants the one fastest reach (phone, email only as
                 a fallback). -->
            <div
              class="flex shrink-0 flex-col gap-1 sm:items-end sm:text-right"
            >
              {#if !info.email && !info.phone}
                <span
                  class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                  Aucun contact renseigné
                </span>
              {:else if rec.kind === 'opportunity'}
                {#if info.email}{@render emailRow(info.email)}{/if}
                {#if info.phone}{@render phoneRow(info.phone)}{/if}
              {:else if info.phone}
                {@render phoneRow(info.phone)}
              {:else if info.email}
                {@render emailRow(info.email)}
              {/if}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}
