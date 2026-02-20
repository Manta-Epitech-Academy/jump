<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { buttonVariants } from '$lib/components/ui/button';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';

	let {
		open = $bindable(false),
		action,
		title = 'Êtes-vous sûr ?',
		description = 'Cette action est irréversible.',
		buttonText = 'Supprimer',
		onSuccess
	}: {
		open: boolean;
		action: string;
		title?: string;
		description?: string;
		buttonText?: string;
		onSuccess?: () => void;
	} = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
			<form
				{action}
				method="POST"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success' || result.type === 'redirect') {
							if (result.type === 'success') {
								toast.success('Action effectuée');
							}
							open = false;
							if (onSuccess) onSuccess();
							await update();
						} else {
							toast.error('Une erreur est survenue');
						}
					};
				}}
			>
				<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>
					{buttonText}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
