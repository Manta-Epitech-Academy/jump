<script lang="ts">
  import StaffTicketsList from '$lib/components/tickets/StaffTicketsList.svelte';

  let { data } = $props();
</script>

<StaffTicketsList tickets={data.tickets} basePath="/staff/pedago" />
