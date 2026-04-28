<script lang="ts">
  import { enhance } from '$app/forms';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import * as Avatar from '$lib/components/ui/avatar';
  import { resolve } from '$app/paths';
  import BringPcBadge from '$lib/components/events/BringPcBadge.svelte';
  import { cn } from '$lib/utils';

  let { participations, optimisticAdminToggle, optimisticPcToggle } = $props();

  function formatFirstName(name: string | undefined) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
</script>

<div
  class="rounded-sm border bg-card shadow-sm dark:border-border/50 dark:shadow-none"
>
  <div class="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
    <h3 class="text-sm font-bold uppercase">Suivi ADM</h3>
    <p class="text-xs text-muted-foreground">
      Cliquer sur un statut pour le faire basculer (OK / En attente).
    </p>
  </div>

  <div class="overflow-x-auto">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-64">Participant</Table.Head>
          <Table.Head class="text-center">Charte informatique</Table.Head>
          <Table.Head class="text-center">Convention de stage</Table.Head>
          <Table.Head class="text-center">Droit à l'image</Table.Head>
          <Table.Head class="text-center">Matériel (PC)</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each participations as p (p.id)}
          <Table.Row class="hover:bg-muted/20">
            <!-- Profil -->
            <Table.Cell class="py-4">
              <div class="flex items-center gap-3">
                <Avatar.Root class="h-8 w-8 rounded-sm">
                  <Avatar.Fallback
                    class="bg-primary/10 text-xs font-bold text-primary"
                  >
                    {p.talent?.nom?.[0]}{p.talent?.prenom?.[0]}
                  </Avatar.Fallback>
                </Avatar.Root>
                <div class="flex flex-col">
                  <a
                    href={resolve(`/staff/dev/students/${p.talent.id}`)}
                    class="text-sm font-bold transition-colors hover:text-epi-blue hover:underline"
                  >
                    <span class="uppercase">{p.talent.nom}</span>
                    {formatFirstName(p.talent.prenom)}
                  </a>
                  <span class="text-[10px] text-muted-foreground uppercase"
                    >{p.talent.niveau}</span
                  >
                </div>
              </div>
            </Table.Cell>

            <!-- Charte Info : On interroge stageCompliance -->
            <Table.Cell class="py-4 text-center">
              <form
                method="POST"
                action="?/toggleAdminDoc"
                use:enhance={optimisticAdminToggle(p.id, 'charte')}
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
                          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
                      )}
                    >
                      {p.stageCompliance?.charteSigned ? 'OK' : 'En attente'}
                    </Badge>
                  {/key}
                </button>
              </form>
            </Table.Cell>

            <!-- Convention -->
            <Table.Cell class="py-4 text-center">
              <form
                method="POST"
                action="?/toggleAdminDoc"
                use:enhance={optimisticAdminToggle(p.id, 'convention')}
              >
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="docType" value="convention" />
                <input
                  type="hidden"
                  name="state"
                  value={p.stageCompliance?.conventionSigned?.toString() ||
                    'false'}
                />
                <button
                  type="submit"
                  class="cursor-pointer transition-transform active:scale-90"
                >
                  {#key p.stageCompliance?.conventionSigned}
                    <Badge
                      variant={p.stageCompliance?.conventionSigned
                        ? 'outline'
                        : 'secondary'}
                      class={cn(
                        'animate-in duration-300 zoom-in',
                        p.stageCompliance?.conventionSigned
                          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
                      )}
                    >
                      {p.stageCompliance?.conventionSigned
                        ? 'OK'
                        : 'En attente'}
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
                          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400',
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
                <input
                  type="hidden"
                  name="state"
                  value={p.bringPc.toString()}
                />
                <div class="inline-block transition-transform active:scale-90">
                  {#key p.bringPc}
                    <div class="animate-in duration-300 zoom-in">
                      <BringPcBadge bringPc={p.bringPc} />
                    </div>
                  {/key}
                </div>
              </form>
            </Table.Cell>
          </Table.Row>
        {:else}
          <Table.Row>
            <Table.Cell
              colspan={5}
              class="py-12 text-center text-muted-foreground"
            >
              Aucun inscrit pour cet événement.
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
