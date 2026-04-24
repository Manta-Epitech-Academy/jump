import { toast } from 'svelte-sonner';

type ActionErrorResult = {
  type: 'error';
  status?: number;
  error: unknown;
};

export function onErrorToast(options: { fallback?: string } = {}) {
  const fallback = options.fallback ?? 'Action impossible.';
  return ({ result }: { result: ActionErrorResult }) => {
    const status = result.status;
    const rawMessage = (result.error as { message?: string } | null)?.message;

    if (status === 403) {
      toast.error("Action réservée aux responsables de l'espace.");
      return;
    }
    toast.error(rawMessage || fallback);
  };
}
