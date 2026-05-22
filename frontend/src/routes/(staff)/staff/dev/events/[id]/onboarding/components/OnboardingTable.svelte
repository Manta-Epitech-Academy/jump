<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import { Badge } from '$lib/components/ui/badge';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { resolve } from '$app/paths';
  import Send from '@lucide/svelte/icons/send';
  import Users from '@lucide/svelte/icons/users';
  import BringPcBadge from '$lib/components/events/BringPcBadge.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import TalentName from '$lib/components/students/TalentName.svelte';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import { cn } from '$lib/utils';
  import type { RelanceType } from '$lib/domain/relance';
  import { track } from '$lib/analytics';

  let {
    participations,
    optimisticAdminToggle,
    optimisticPcToggle,
    selectedTalentIds = new Set<string>(),
    onToggleTalent,
    onToggleAll,
    onRowRelance,
  }: {
    participations: any[];
    optimisticAdminToggle: (id: string, docType: string) => any;
    optimisticPcToggle: (id: string) => any;
    selectedTalentIds?: Set<string>;
    onToggleTalent: (talentId: string) => void;
    onToggleAll: () => void;
    onRowRelance?: (talentId: string, type: RelanceType) => void;
  } = $props();

  function lastReminderLabel(
    reminders: { sentAt: Date; type: string }[],
  ): string {
    if (!reminders || reminders.length === 0) return '—';
    const d = new Date(reminders[0].sentAt);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  }
</script>

<div
  class="rounded-sm border bg-card shadow-sm dark:border-border/50 dark:shadow-none"
>
  <table data-slot="table" class="w-full caption-bottom text-sm">
    <Table.Header
      class="sticky top-0 z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_0_var(--border)]"
    >
      <Table.Row>
        <Gated group="devLead" mode="hide">
          <Table.Head class="w-10">
            <Checkbox
              checked={selectedTalentIds.size === participations.length &&
                participations.length > 0}
              indeterminate={selectedTalentIds.size > 0 &&
                selectedTalentIds.size < participations.length}
              onCheckedChange={onToggleAll}
            />
          </Table.Head>
        </Gated>
        <Table.Head class="w-64">Participant</Table.Head>
        <Table.Head class="text-center">
          <span class="inline-flex items-center justify-center gap-1.5">
            Règlement intérieur
            <InfoTooltip
              text="Signé en ligne par le stagiaire depuis son espace personnel, à la dernière étape de son onboarding. Cochez manuellement uniquement en cas de signature papier."
            />
          </span>
        </Table.Head>
        <Table.Head class="text-center">
          <span class="inline-flex items-center justify-center gap-1.5">
            Droit à l'image
            <InfoTooltip
              text="Autorisation parentale pour les photos/vidéos du stage. Demandée automatiquement par email aux parents à la création du compte. Cochez manuellement uniquement en cas de retour papier."
            />
          </span>
        </Table.Head>
        <Table.Head class="text-center">Matériel (PC)</Table.Head>
        <Gated group="devLead" mode="hide">
          <Table.Head class="text-center">Dernière relance</Table.Head>
          <Table.Head class="w-24 text-center">Actions</Table.Head>
        </Gated>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each participations as p (p.id)}
        <Table.Row class="hover:bg-muted/20">
          <Gated group="devLead" mode="hide">
            <Table.Cell>
              <Checkbox
                checked={selectedTalentIds.has(p.talent.id)}
                onCheckedChange={() => onToggleTalent(p.talent.id)}
              />
            </Table.Cell>
          </Gated>

          <!-- Profil -->
          <Table.Cell class="py-4">
            <div class="flex items-center gap-3">
              <TalentAvatar talent={p.talent} size="sm" />
              <a
                href={`${resolve(`/staff/dev/students/${p.talent.id}`)}?tab=admin`}
                class="text-sm font-bold transition-colors hover:text-epi-blue hover:underline"
              >
                <TalentName talent={p.talent} />
              </a>
            </div>
          </Table.Cell>

          <!-- Charte -->
          <Table.Cell class="py-4 text-center">
            <form
              method="POST"
              action="?/toggleAdminDoc"
              use:enhance={optimisticAdminToggle(p.id, 'charte')}
              onsubmit={() =>
                track('adm_doc_toggled', {
                  docType: 'charte',
                  newState: !p.stageCompliance?.charteSigned,
                  eventId: page.params.id,
                })}
            >
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="docType" value="charte" />
              <input
                type="hidden"
                name="state"
                value={p.stageCompliance?.charteSigned?.toString() || 'false'}
              />
              <button
                type="submit"
                class="cursor-pointer transition-transform active:scale-90"
              >
                {#key p.stageCompliance?.charteSigned}
                  <Badge
                    variant={p.stageCompliance?.charteSigned
                      ? 'outline'
                      : 'secondary'}
                    class={cn(
                      'animate-in duration-300 zoom-in',
                      p.stageCompliance?.charteSigned
                        ? 'border-epi-teal-solid/30 bg-epi-teal-solid/10 text-epi-teal-solid'
                        : 'border-epi-orange/30 bg-epi-orange/10 text-epi-orange hover:bg-epi-orange/15',
                    )}
                  >
                    {p.stageCompliance?.charteSigned ? 'OK' : 'Manquant'}
                  </Badge>
                {/key}
              </button>
            </form>
          </Table.Cell>

          <!-- Droit Image -->
          <Table.Cell class="py-4 text-center">
            <form
              method="POST"
              action="?/toggleAdminDoc"
              use:enhance={optimisticAdminToggle(p.id, 'image')}
              onsubmit={() =>
                track('adm_doc_toggled', {
                  docType: 'image',
                  newState: !p.stageCompliance?.imageRightsSigned,
                  eventId: page.params.id,
                })}
            >
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="docType" value="image" />
              <input
                type="hidden"
                name="state"
                value={p.stageCompliance?.imageRightsSigned?.toString() ||
                  'false'}
              />
              <button
                type="submit"
                class="cursor-pointer transition-transform active:scale-90"
              >
                {#key p.stageCompliance?.imageRightsSigned}
                  <Badge
                    variant={p.stageCompliance?.imageRightsSigned
                      ? 'outline'
                      : 'secondary'}
                    class={cn(
                      'animate-in duration-300 zoom-in',
                      p.stageCompliance?.imageRightsSigned
                        ? 'border-epi-teal-solid/30 bg-epi-teal-solid/10 text-epi-teal-solid'
                        : 'border-epi-orange/30 bg-epi-orange/10 text-epi-orange hover:bg-epi-orange/15',
                    )}
                  >
                    {p.stageCompliance?.imageRightsSigned ? 'OK' : 'Manquant'}
                  </Badge>
                {/key}
              </button>
            </form>
          </Table.Cell>

          <!-- Bring PC -->
          <Table.Cell class="py-4 text-center">
            <form
              method="POST"
              action="?/toggleBringPc"
              use:enhance={optimisticPcToggle(p.id)}
            >
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="state" value={p.bringPc.toString()} />
              <button
                type="submit"
                class="inline-block cursor-pointer transition-transform active:scale-90"
              >
                {#key p.bringPc}
                  <div class="animate-in duration-300 zoom-in">
                    <BringPcBadge bringPc={p.bringPc} />
                  </div>
                {/key}
              </button>
            </form>
          </Table.Cell>

          <!-- Dernière relance -->
          <Gated group="devLead" mode="hide">
            <Table.Cell class="py-4 text-center text-sm text-muted-foreground">
              {lastReminderLabel(p.talent.reminders)}
            </Table.Cell>
            <Table.Cell class="py-4 text-center">
              <div class="inline-flex items-center gap-1">
                <Tooltip.Provider delayDuration={150}>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!(p.talent.email || p.talent.user?.email)}
                          onclick={() => onRowRelance?.(p.talent.id, 'student')}
                          aria-label="Relancer étudiant"
                          class="h-7 w-7 text-muted-foreground hover:text-epi-blue"
                        >
                          <Send class="h-3.5 w-3.5" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content>Relancer étudiant</Tooltip.Content>
                  </Tooltip.Root>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!p.talent.parentEmail}
                          onclick={() => onRowRelance?.(p.talent.id, 'parent')}
                          aria-label="Relancer parent"
                          class="h-7 w-7 text-muted-foreground hover:text-epi-blue"
                        >
                          <Users class="h-3.5 w-3.5" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content>Relancer parent</Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </div>
            </Table.Cell>
          </Gated>
        </Table.Row>
      {/each}
    </Table.Body>
  </table>
</div>
