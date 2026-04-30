<script lang="ts">
  import type { PageData } from './$types';
  import { Clock } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { resolve } from '$app/paths';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import PedagoTalentCard from './components/PedagoTalentCard.svelte';
  import StudentTimeline from '$lib/components/students/StudentTimeline.svelte';

  let { data }: { data: PageData } = $props();

  let xpProgress = $derived(Math.min((data.student.xp / 1000) * 100, 100));
</script>

<div class="space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/pedago') },
      { label: `${data.student.nom} ${data.student.prenom}` },
    ]}
  />
  <h1 class="text-3xl font-bold text-epi-blue uppercase">
    Suivi Pédagogique<span class="text-foreground">_</span>
  </h1>

  <div class="grid gap-6 md:grid-cols-12">
    <div class="space-y-6 md:col-span-4 lg:col-span-3">
      <PedagoTalentCard
        student={data.student}
        stats={data.stats}
        {xpProgress}
        sortedThemes={data.sortedThemes}
        avatarViewTransitionName={`student-avatar-${data.student.id}`}
      />
    </div>

    <div class="space-y-6 md:col-span-8 lg:col-span-9">
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-xl font-bold uppercase">
          <Clock class="h-5 w-5 text-muted-foreground" /> Historique et Observations
        </h2>
        <Badge variant="secondary">{data.participations.length} sessions</Badge>
      </div>

      <StudentTimeline
        participations={data.participations}
        timezone={data.timezone}
      />
    </div>
  </div>
</div>
