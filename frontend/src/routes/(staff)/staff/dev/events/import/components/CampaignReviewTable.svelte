<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import {
    Laptop,
    ArrowRight,
    UserPlus,
    Link as LinkIcon,
    Split,
  } from '@lucide/svelte';

  let { analysisResult = $bindable() } = $props();

  function toggleDecision(
    rowId: string,
    newDecision: 'CREATE_NEW' | 'LINK_EXISTING',
  ) {
    if (!analysisResult) return;
    const row = analysisResult.analysisData.find((r: any) => r.id === rowId);
    if (row) {
      row.decision = newDecision;
      analysisResult.analysisData = [...analysisResult.analysisData];
    }
  }

  function toggleBringPc(rowId: string) {
    if (!analysisResult) return;
    const row = analysisResult.analysisData.find((r: any) => r.id === rowId);
    if (row) {
      row.bringPc = !row.bringPc;
      analysisResult.analysisData = [...analysisResult.analysisData];
    }
  }
</script>

<div class="rounded-sm border shadow-sm">
  <div
    class="flex items-center justify-between border-b bg-muted/30 px-5 py-3 text-xs font-bold tracking-widest text-muted-foreground uppercase"
  >
    <span>Revue des Talents ({analysisResult.analysisData.length})</span>
    <span class="text-[9px]">Cochez ceux qui apportent leur PC</span>
  </div>

  <ScrollArea class="h-96">
    <div class="divide-y divide-border/50">
      {#each analysisResult.analysisData as row (row.id)}
        {@const isNew = row.suggestedStatus === 'NEW'}
        {@const isConflict =
          row.suggestedStatus === 'CONFLICT' ||
          row.suggestedStatus === 'SIBLING'}

        <div
          class="flex flex-col gap-4 p-4 lg:flex-row lg:items-center {isConflict
            ? 'bg-yellow-50/50 dark:bg-yellow-950/20'
            : ''}"
        >
          <div class="flex w-full items-start gap-3 lg:w-auto">
            <div
              class="flex flex-col items-center justify-center border-r pr-4"
            >
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant={row.bringPc ? 'secondary' : 'outline'}
                        size="icon"
                        class="h-9 w-9 rounded-sm transition-colors {row.bringPc
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300'
                          : 'text-gray-400'}"
                        onclick={() => toggleBringPc(row.id)}
                      >
                        <Laptop class="h-4 w-4" />
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content class="rounded-sm"
                    ><p>Apporte son PC ?</p></Tooltip.Content
                  >
                </Tooltip.Root>
              </Tooltip.Provider>
              <span
                class="mt-1 text-[9px] font-bold tracking-widest text-muted-foreground uppercase"
              >
                {row.bringPc ? 'Avec PC' : 'Sans PC'}
              </span>
            </div>

            <div class="flex-1 space-y-1 pl-2">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-bold uppercase"
                  >{row.csvData.nom}
                  <span class="capitalize">{row.csvData.prenom}</span></span
                >
                <Badge
                  variant="outline"
                  class="rounded-sm text-[9px] tracking-widest uppercase"
                  >{row.csvData.niveau}</Badge
                >
              </div>
              <div class="text-xs font-medium text-muted-foreground">
                {row.csvData.email}
              </div>
              <div class="mt-1 flex gap-2">
                {#if isNew}<Badge
                    variant="default"
                    class="rounded-sm bg-blue-500 text-[9px] tracking-widest text-white uppercase hover:bg-blue-600"
                    >Nouveau</Badge
                  >{/if}
                {#if isConflict}
                  <Badge
                    variant="outline"
                    class="rounded-sm border-yellow-400 bg-yellow-50 text-[9px] tracking-widest text-yellow-700 uppercase dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-500"
                  >
                    {row.suggestedStatus === 'SIBLING'
                      ? 'Fratrie ?'
                      : 'Homonyme ?'}
                  </Badge>
                {/if}
              </div>
            </div>
          </div>

          <div
            class="hidden flex-col items-center justify-center px-2 text-center lg:flex"
          >
            {#if row.existingStudent}<ArrowRight
                class="h-4 w-4 text-muted-foreground opacity-50"
              />{/if}
            {#if row.matchReason}<span
                class="mt-1 max-w-24 text-[9px] leading-tight font-bold tracking-widest text-muted-foreground uppercase"
                >{row.matchReason}</span
              >{/if}
          </div>

          <div class="w-full lg:flex-1">
            {#if row.existingStudent}
              <div class="rounded-sm border bg-muted/10 p-3 text-sm shadow-sm">
                <div
                  class="mb-1 text-[9px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                  Dossier en base :
                </div>
                <div class="font-bold text-foreground uppercase">
                  {row.existingStudent.nom}
                  <span class="capitalize">{row.existingStudent.prenom}</span>
                </div>
                <div class="mt-0.5 text-xs font-medium text-muted-foreground">
                  {row.existingStudent.email} • {row.existingStudent.niveau}
                </div>
              </div>
            {:else}
              <div
                class="flex h-full items-center justify-center text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >
                Aucune correspondance
              </div>
            {/if}
          </div>

          <div
            class="w-full border-t border-border/50 pt-4 lg:min-w-[14rem] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5"
          >
            <span
              class="text-[9px] font-bold tracking-widest text-muted-foreground uppercase"
              >Action à effectuer</span
            >
            <div class="mt-2 flex flex-col gap-2">
              <button
                type="button"
                class="flex items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-all {row.decision ===
                'CREATE_NEW'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:bg-blue-900/20 dark:text-blue-400'
                  : 'bg-card text-muted-foreground hover:bg-muted'}"
                onclick={() => toggleDecision(row.id, 'CREATE_NEW')}
              >
                <div class="flex items-center gap-2">
                  {#if row.suggestedStatus === 'SIBLING'}<Split
                      class="h-3.5 w-3.5"
                    />{:else}<UserPlus class="h-3.5 w-3.5" />{/if}
                  <span>Créer dossier</span>
                </div>
                {#if row.decision === 'CREATE_NEW'}<div
                    class="h-2 w-2 rounded-full bg-blue-500"
                  ></div>{/if}
              </button>

              {#if row.existingStudent}
                <button
                  type="button"
                  class="flex items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-all {row.decision ===
                  'LINK_EXISTING'
                    ? 'border-epi-teal-solid bg-epi-teal-solid/10 text-epi-teal-solid shadow-sm'
                    : 'bg-card text-muted-foreground hover:bg-muted'}"
                  onclick={() => toggleDecision(row.id, 'LINK_EXISTING')}
                >
                  <div class="flex items-center gap-2">
                    <LinkIcon class="h-3.5 w-3.5" /><span>Lier existant</span>
                  </div>
                  {#if row.decision === 'LINK_EXISTING'}<div
                      class="h-2 w-2 rounded-full bg-epi-teal-solid"
                    ></div>{/if}
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </ScrollArea>
</div>
