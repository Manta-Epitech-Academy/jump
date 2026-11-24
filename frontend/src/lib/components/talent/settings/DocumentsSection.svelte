<!--
  « Mes documents »: what the talent signed during onboarding (their
  image-rights decision, one règlement per school year), each with its PDF
  once it is rendered. The settings' menu offers this section only when there
  is something in it.
-->
<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '#lib/components/ui/button/index.ts';
  import FileText from '@lucide/svelte/icons/file-text';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Loader from '@lucide/svelte/icons/loader';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import { formatDateFr } from '#lib/utils.ts';
  import SettingsSection from './SettingsSection.svelte';

  type SignedDocument = {
    type: string;
    label: string;
    schoolYear: string | null;
    signedAt: Date;
    signerName: string | null;
    coSigner: { name: string; signedAt: Date } | null;
    /** Rendered, still rendering, or failed (`resolveTalentDocumentStatus`). */
    status: 'ready' | 'generating' | 'failed';
  };

  let { documents }: { documents: SignedDocument[] } = $props();
</script>

<SettingsSection title="Mes documents">
  <ul class="space-y-3">
    <!-- Keyed on type + year: the règlement is signed once per année
         scolaire, so a returning talent has one row per year and the type
         alone is no longer unique. -->
    {#each documents as doc (`${doc.type}-${doc.schoolYear ?? ''}`)}
      <li class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/10"
        >
          <FileText class="h-4 w-4 text-epi-tech-ink" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm leading-tight font-bold text-foreground">
            {doc.label}{doc.schoolYear ? ` ${doc.schoolYear}` : ''}
          </p>
          <p class="epi-overline text-muted-foreground">
            {#if doc.signerName}
              Signé par {doc.signerName} le {formatDateFr(doc.signedAt)}
            {:else}
              Signé le {formatDateFr(doc.signedAt)}
            {/if}
          </p>
          {#if doc.coSigner}
            <p class="epi-overline text-muted-foreground">
              Co-signé par {doc.coSigner.name} le {formatDateFr(
                doc.coSigner.signedAt,
              )}
            </p>
          {/if}
        </div>
        {#if doc.status === 'ready'}
          <Button
            variant="outline"
            size="sm"
            href={doc.schoolYear
              ? `${resolve(`settings/documents/${doc.type}`)}?annee=${doc.schoolYear}`
              : resolve(`settings/documents/${doc.type}`)}
            target="_blank"
            rel="noopener"
            class="h-9 shrink-0 rounded-xl text-xs font-bold"
          >
            <ExternalLink class="mr-1 h-3.5 w-3.5" />
            Voir
          </Button>
        {:else if doc.status === 'generating'}
          <span
            class="flex shrink-0 items-center gap-1 epi-overline text-muted-foreground"
          >
            <Loader class="h-3.5 w-3.5 animate-spin" />
            Génération…
          </span>
        {:else}
          <span
            class="flex shrink-0 items-center gap-1 epi-overline text-warning"
            title="La génération de ce document a échoué. Notre équipe peut le relancer, réessaie plus tard ou contacte-la."
          >
            <AlertTriangle class="h-3.5 w-3.5" />
            Indisponible
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</SettingsSection>
