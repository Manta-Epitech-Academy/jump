export const ONBOARDING_FILTER_KEYS = [
  'all',
  'incomplete',
  'charte-missing',
  'image-rights-missing',
  'pc-missing',
] as const;
export type OnboardingFilterKey = (typeof ONBOARDING_FILTER_KEYS)[number];

export const DOC_FILTER_KEYS = [
  'charte-missing',
  'image-rights-missing',
  'pc-missing',
] as const;
export type DocFilterKey = (typeof DOC_FILTER_KEYS)[number];

export const DOC_FILTER_LABELS: Record<DocFilterKey, string> = {
  'charte-missing': 'Charte manquante',
  'image-rights-missing': "Droit à l'image manquant",
  'pc-missing': 'PC à prévoir',
};
