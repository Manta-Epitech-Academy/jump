export function getParentLastName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const rest = trimmed.split(' ').slice(1).join(' ');
  return rest || trimmed;
}
