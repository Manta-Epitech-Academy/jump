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
  } from 'lucide-svelte';

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
      row.bring_pc = !row.bring_pc;
      analysisResult.analysisData = [...analysisResult.analysisData];
    }
  }
</script>

<div class="rounded-sm border">
  <div
    class="flex items-center justify-between border-b bg-muted/50 px-4 py-2 text-xs font-bold uppercase"
  >
    <span>Revue des élèves ({analysisResult.analysisData.length})</span>
    <span class="text-muted-foreground">Cochez ceux qui apportent leur PC</span>
  </div>

  <ScrollArea class="h-125">
    <div class="divide-y">
      {#each analysisResult.analysisData as row (row.id)}
        {@const isNew = row.suggestedStatus === 'NEW'}
        {@const isConflict =
          row.suggestedStatus === 'CONFLICT' ||
          row.suggestedStatus === 'SIBLING'}

        <div
          class="flex flex-col gap-4 p-4 lg:flex-row lg:items-center {isConflict
            ? 'bg-yellow-50/50'
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
                        variant={row.bring_pc ? 'secondary' : 'outline'}
                        size="icon"
                        class="h-10 w-10 transition-colors {row.bring_pc
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          : 'text-gray-400'}"
                        onclick={() => toggleBringPc(row.id)}
                      >
                        <Laptop class="h-5 w-5" />
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content><p>Apporte son PC ?</p></Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
              <span
                class="mt-1 text-[9px] font-bold text-muted-foreground uppercase"
              >
                {row.bring_pc ? 'Avec PC' : 'Sans PC'}
              </span>
            </div>

            <div class="flex-1 space-y-1 pl-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold"
                  >{row.csvData.nom} {row.csvData.prenom}</span
                >
                <Badge variant="outline" class="text-[10px]"
                  >{row.csvData.niveau}</Badge
                >
              </div>
              <div class="text-xs text-muted-foreground">
                {row.csvData.email}
              </div>
              {#if isNew}<Badge
                  variant="default"
                  class="bg-blue-500 text-[10px]">Nouveau</Badge
                >{/if}
              {#if isConflict}
                <Badge
                  variant="outline"
                  class="border-yellow-500 bg-yellow-100 text-[10px] text-yellow-700"
                >
                  {row.suggestedStatus === 'SIBLING'
                    ? 'Fratrie ?'
                    : 'Homonyme ?'}
                </Badge>
              {/if}
            </div>
          </div>

          <div
            class="hidden flex-col items-center justify-center px-2 text-center lg:flex"
          >
            {#if row.existingStudent}<ArrowRight
                class="h-4 w-4 text-muted-foreground"
              />{/if}
            {#if row.matchReason}<span
                class="mt-1 max-w-30 text-[9px] text-muted-foreground"
                >{row.matchReason}</span
              >{/if}
          </div>

          <div class="w-full lg:flex-1">
            {#if row.existingStudent}
              <div class="rounded border bg-white p-2 text-sm shadow-sm">
                <div class="font-bold text-muted-foreground">En Base :</div>
                <div class="font-medium">
                  {row.existingStudent.nom}
                  {row.existingStudent.prenom}
                </div>
                <div class="text-xs text-muted-foreground">
                  {row.existingStudent.email}
                </div>
                <div class="text-xs text-muted-foreground">
                  {row.existingStudent.niveau}
                </div>
              </div>
            {:else}
              <div
                class="flex h-full items-center justify-center text-xs text-muted-foreground italic"
              >
                Aucune correspondance
              </div>
            {/if}
          </div>

          <div
            class="w-full border-t pt-4 lg:min-w-55 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4"
          >
            <span class="text-[10px] font-bold text-muted-foreground uppercase"
              >Action à effectuer :</span
            >
            <div class="mt-1 flex flex-col gap-1">
              <button
                type="button"
                class="flex items-center justify-between rounded-sm border px-3 py-2 text-xs font-bold transition-all {row.decision ===
                'CREATE_NEW'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                  : 'text-muted-foreground hover:bg-muted'}"
                onclick={() => toggleDecision(row.id, 'CREATE_NEW')}
              >
                <div class="flex items-center gap-2">
                  {#if row.suggestedStatus === 'SIBLING'}<Split
                      class="h-3.5 w-3.5"
                    />{:else}<UserPlus class="h-3.5 w-3.5" />{/if}
                  <span>Créer un nouveau</span>
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
                    ? 'border-teal-500 bg-teal-50 text-teal-700 ring-1 ring-teal-500'
                    : 'text-muted-foreground hover:bg-muted'}"
                  onclick={() => toggleDecision(row.id, 'LINK_EXISTING')}
                >
                  <div class="flex items-center gap-2">
                    <LinkIcon class="h-3.5 w-3.5" /><span
                      >Lier à l'existant</span
                    >
                  </div>
                  {#if row.decision === 'LINK_EXISTING'}<div
                      class="h-2 w-2 rounded-full bg-teal-500"
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
