export const SUIVI_FILTER_KEYS = [
  'all',
  'convention-missing',
  'charte-missing',
  'image-rights-missing',
  'pc-missing',
] as const;
export type SuiviFilterKey = (typeof SUIVI_FILTER_KEYS)[number];
