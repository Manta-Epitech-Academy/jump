<script lang="ts">
  import type { PageData } from './$types';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import { ChevronLeft, FileSpreadsheet, LoaderCircle } from '@lucide/svelte';
  import { enhance as kitEnhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { resolve } from '$app/paths';
  import MultiStaffSelect from '$lib/components/events/MultiStaffSelect.svelte';

  import FakeProgressLoader from './components/FakeProgressLoader.svelte';
  import CsvDropzone from './components/CsvDropzone.svelte';
  import CampaignReviewTable from './components/CampaignReviewTable.svelte';

  let { data }: { data: PageData } = $props();

  let isAnalyzing = $state(false);
  let isConfirming = $state(false);
  let analysisResult = $state<any>(null);
  let selectedFileName = $state<string>('');

  let importMantas = $state<string[]>([]);
  let importNotes = $state('');

  // Loading messaging state
  let loadingMessages = [
    'Lecture du fichier CSV...',
    'Comparaison avec la base de données...',
    'Détection des homonymes...',
    'Vérification des niveaux scolaires...',
    'Recherche de doublons...',
    'Préparation de la liste...',
    'Synchronisation en cours...',
  ];
  let currentMessage = $state('');
  let progress = $state(0);
  let progressInterval: ReturnType<typeof setInterval>;

  function startFakeProgress() {
    progress = 0;
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      if (progress < 40) progress += 5;
      else if (progress < 70) progress += 2;
      else if (progress < 95) progress += 0.5;
    }, 200);
  }

  function completeProgress(callback: () => void) {
    clearInterval(progressInterval);
    progress = 100;
    setTimeout(() => {
      callback();
    }, 300);
  }

  $effect(() => {
    if (isAnalyzing || isConfirming) {
      currentMessage = loadingMessages[0];
      const interval = setInterval(() => {
        const idx = Math.floor(Math.random() * loadingMessages.length);
        currentMessage = loadingMessages[idx];
      }, 1200);
      return () => clearInterval(interval);
    }
  });
</script>

<div class="mx-auto max-w-5xl space-y-6">
  <div class="flex items-center gap-4 border-b pb-4">
    <a
      href={resolve('/staff/dev')}
      class={buttonVariants({ variant: 'ghost', size: 'icon' })}
    >
      <ChevronLeft class="h-4 w-4" />
    </a>
    <h1 class="text-3xl font-bold tracking-tight text-epi-blue uppercase">
      Nouvel Événement<span class="text-epi-teal">_</span>
    </h1>
  </div>

  <Card.Root
    class="border-t-4 border-t-epi-teal-solid shadow-md dark:shadow-none dark:ring-1 dark:ring-border/50"
  >
    <Card.Header>
      <Card.Title
        class="flex items-center gap-2 font-heading text-xl tracking-tight uppercase"
      >
        <FileSpreadsheet class="h-5 w-5 text-epi-teal-solid" />
        Import Événement CSV
      </Card.Title>
      <Card.Description>
        Importez un fichier CSV d'événement Salesforce. Vous pourrez ensuite
        spécifier si les Talents apportent leur PC.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <!-- STEP 1: UPLOAD & ANALYZE -->
      {#if !analysisResult}
        <form
          action="?/analyzeCampaign"
          method="POST"
          enctype="multipart/form-data"
          use:kitEnhance={() => {
            isAnalyzing = true;
            startFakeProgress();
            return async ({ result }) => {
              completeProgress(() => {
                isAnalyzing = false;
                if (result.type === 'success' && result.data) {
                  if (result.data.analysisSuccess) {
                    analysisResult = result.data;
                  } else {
                    toast.error(
                      (result.data as Record<string, any>).error ||
                        "Erreur d'analyse",
                    );
                  }
                } else if (result.type === 'failure') {
                  toast.error(
                    (result.data as Record<string, any> | undefined)?.error ||
                      "Erreur d'analyse",
                  );
                } else {
                  toast.error("Erreur d'analyse");
                }
              });
            };
          }}
          class="space-y-6 py-6"
        >
          <CsvDropzone bind:selectedFileName />

          <div class="flex justify-end">
            <Button
              type="submit"
              class="bg-epi-blue text-white shadow-md hover:bg-epi-blue/90 dark:shadow-none"
              disabled={isAnalyzing || !selectedFileName}
            >
              {#if isAnalyzing}
                <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
                Analyse en cours...
              {:else}
                Analyser le fichier
              {/if}
            </Button>
          </div>
        </form>
        <!-- STEP 2: REVIEW & DECIDE -->
      {:else}
        <div class="space-y-6">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>Événement</Label><Input
                value={analysisResult.eventName}
                readonly
                class="bg-muted text-sm font-bold tracking-tight uppercase"
              />
            </div>
            <div class="space-y-2">
              <Label>Date</Label><Input
                value={new Date(analysisResult.eventDate).toLocaleDateString(
                  'fr-FR',
                  { timeZone: data.timezone },
                )}
                readonly
                class="bg-muted font-bold"
              />
            </div>
          </div>

          <CampaignReviewTable bind:analysisResult />

          <form
            action="?/confirmCampaignImport"
            method="POST"
            use:kitEnhance={() => {
              isConfirming = true;
              startFakeProgress();
              return async ({ update }) => {
                completeProgress(async () => {
                  await update();
                  isConfirming = false;
                });
              };
            }}
            class="space-y-6 pt-4"
          >
            <input
              type="hidden"
              name="importData"
              value={JSON.stringify(analysisResult.analysisData)}
            />
            <input
              type="hidden"
              name="eventName"
              value={analysisResult.eventName}
            />
            <input
              type="hidden"
              name="eventDate"
              value={analysisResult.eventDate}
            />

            <div class="grid gap-4 md:grid-cols-2">
              <div class="space-y-2 rounded-md border bg-muted/20 p-4">
                <Label>Mantas pour cet événement</Label>
                <MultiStaffSelect
                  staff={data.staff}
                  bind:value={importMantas}
                  name="mantas"
                />
                <p
                  class="text-[10px] font-bold text-muted-foreground uppercase"
                >
                  Assignez l'équipe qui encadrera cet événement.
                </p>
              </div>
              <div class="space-y-2 rounded-md border bg-muted/20 p-4">
                <Label for="notes">Notes / Planning</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  bind:value={importNotes}
                  placeholder="Notes pour l'événement (planning, instructions...)"
                  class="min-h-20 bg-background"
                />
              </div>
            </div>

            <div class="flex justify-between border-t pt-4">
              <Button
                variant="ghost"
                type="button"
                onclick={() => (analysisResult = null)}>Annuler</Button
              >
              <Button
                type="submit"
                disabled={isConfirming}
                class="bg-epi-teal-solid font-bold text-white shadow-md hover:bg-epi-teal-solid/90 dark:shadow-none"
              >
                {#if isConfirming}
                  <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
                  Création en cours...
                {:else}
                  Valider l'import
                {/if}
              </Button>
            </div>
          </form>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>
</div>

<FakeProgressLoader {isAnalyzing} {isConfirming} {currentMessage} {progress} />
