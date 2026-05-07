<script lang="ts">
  import StaffTicketDetail from '$lib/components/tickets/StaffTicketDetail.svelte';

  let { data } = $props();
</script>

<StaffTicketDetail ticket={data.ticket} basePath="/staff/pedago" />
