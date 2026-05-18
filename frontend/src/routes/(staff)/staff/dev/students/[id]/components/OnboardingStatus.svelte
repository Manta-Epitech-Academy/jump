<script lang="ts">
  import UserCheck from '@lucide/svelte/icons/user-check';
  import * as Card from '$lib/components/ui/card';
  import OnboardingStatusBadge from '$lib/components/students/OnboardingStatusBadge.svelte';
  import {
    deriveOnboardingStatus,
    type TalentOnboardingFields,
  } from '$lib/domain/talentOnboarding';
  import { formatDateFr } from '$lib/utils';

  let {
    student,
    timezone,
  }: {
    student: TalentOnboardingFields;
    timezone: string;
  } = $props();

  const status = $derived(deriveOnboardingStatus(student));
  // The cohort-level status is binary, but on the per-talent detail card we
  // still want to tell the user *why* a talent is not ready — "never validated
  // OTP" and "stuck mid-form" have different remediation messages even though
  // they share the same chip.
  const neverLoggedIn = $derived(student.lastActiveAt == null);
</script>

<Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
  <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
    <Card.Title
      class="flex items-center justify-between gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <span class="flex items-center gap-2">
        <UserCheck class="h-4 w-4 text-epi-blue" />
        Onboarding plateforme
      </span>
      <OnboardingStatusBadge {status} />
    </Card.Title>
  </Card.Header>
  <Card.Content class="space-y-1.5 pt-5 text-sm">
    {#if status === 'done'}
      <p>
        Profil complété le <span class="font-medium text-foreground">
          {formatDateFr(student.infoValidatedAt!, timezone)}
        </span>
      </p>
      <p class="text-xs text-muted-foreground">
        Dernière connexion : {formatDateFr(student.lastActiveAt!, timezone)}
      </p>
    {:else if neverLoggedIn}
      <p class="text-muted-foreground">
        Le talent n'a jamais validé son code OTP — penser à le relancer.
      </p>
    {:else}
      <p class="text-muted-foreground">
        Connecté le {formatDateFr(student.lastActiveAt!, timezone)} mais pas encore
        arrivé au bout du parcours d'onboarding (infos, lycée, centres d'intérêt,
        règlement intérieur).
      </p>
    {/if}
  </Card.Content>
</Card.Root>
