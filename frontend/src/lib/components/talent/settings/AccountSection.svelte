<!--
  « Mon compte »: who the talent is to Jump, read-only. These come from
  Salesforce and the onboarding, so nothing here is edited from the settings;
  a value Jump does not hold is left out rather than shown empty.
-->
<script lang="ts">
  import SettingsSection from './SettingsSection.svelte';

  type Account = {
    prenom: string;
    nom: string;
    email: string | null;
    classe: string | null;
    lycee: string | null;
  };

  let { account }: { account: Account } = $props();

  let fields = $derived(
    [
      { label: 'Prénom', value: account.prenom },
      { label: 'Nom', value: account.nom },
      { label: 'Adresse e-mail', value: account.email },
      { label: 'Classe', value: account.classe },
      { label: 'Lycée', value: account.lycee },
    ].filter((field) => field.value),
  );
</script>

<SettingsSection title="Mon compte">
  <dl class="grid gap-4 sm:grid-cols-2">
    {#each fields as field (field.label)}
      <div class="min-w-0">
        <dt class="epi-overline text-muted-foreground">{field.label}</dt>
        <dd class="truncate text-sm font-bold text-foreground">
          {field.value}
        </dd>
      </div>
    {/each}
  </dl>
</SettingsSection>
