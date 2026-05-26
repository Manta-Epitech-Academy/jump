// Single source of truth for the talent welcome-message template variables.
//
// The welcome message (CmsPage slug `welcome`, per stage event) is authored by
// staff/admins with placeholder tokens and rendered for each talent on the
// dashboard "Actualités" feed and the first-arrival /welcome page. This module
// owns BOTH the catalogue (so the admin editor's insert buttons and the
// substitution stay in lockstep) and the substitution itself (so every render
// site produces identical output). Add a variable here and it lights up
// everywhere — never substitute tokens ad hoc at a call site.

export type WelcomeMessageContext = {
  prenom: string;
  nom: string;
  campusName: string;
  /** Campus contact email; null when the campus hasn't set one. */
  campusContactEmail: string | null;
  /** Title of the stage event the message belongs to. */
  stageName: string;
};

export type WelcomeVariable = {
  /** Literal token as it appears in the content, e.g. `{{PRENOM}}`. */
  token: string;
  /** Short FR label for the editor's insert button. */
  label: string;
  /** FR tooltip explaining what the token resolves to. */
  description: string;
  resolve: (ctx: WelcomeMessageContext) => string;
};

// Tokens stay uppercase and French to match the existing `{{PRENOM}}`/`{{NOM}}`
// convention. Order here is the order of the editor's insert buttons.
export const WELCOME_VARIABLES: readonly WelcomeVariable[] = [
  {
    token: '{{PRENOM}}',
    label: 'Prénom',
    description: 'Prénom du talent',
    resolve: (c) => c.prenom,
  },
  {
    token: '{{NOM}}',
    label: 'Nom',
    description: 'Nom du talent',
    resolve: (c) => c.nom,
  },
  {
    token: '{{CAMPUS}}',
    label: 'Campus',
    description: 'Nom du campus du talent',
    resolve: (c) => c.campusName,
  },
  {
    token: '{{EMAIL_CAMPUS}}',
    label: 'Email campus',
    description: 'Adresse de contact du campus',
    resolve: (c) => c.campusContactEmail ?? '',
  },
  {
    token: '{{STAGE}}',
    label: 'Stage',
    description: 'Nom du stage en cours',
    resolve: (c) => c.stageName,
  },
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tokenPattern(token: string): RegExp {
  // Escape regex-significant chars (the braces) and match case-insensitively,
  // preserving the leniency the original `/\{\{PRENOM\}\}/gi` substitution had.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'gi');
}

/**
 * Replaces every known token in the (already DOMPurify-sanitized) HTML content
 * with its resolved value. Resolved values are HTML-escaped because they land
 * in markup rendered with `{@html}` — a campus name or email must never be able
 * to inject tags.
 */
export function renderWelcomeMessage(
  content: string,
  ctx: WelcomeMessageContext,
): string {
  let out = content;
  for (const variable of WELCOME_VARIABLES) {
    out = out.replace(tokenPattern(variable.token), () =>
      escapeHtml(variable.resolve(ctx)),
    );
  }
  return out;
}

/** Placeholder context for the admin preview when no real talent applies. */
export function sampleWelcomeContext(): WelcomeMessageContext {
  return {
    prenom: 'Marie',
    nom: 'Dupont',
    campusName: 'Paris',
    campusContactEmail: 'contact@epitech.eu',
    stageName: 'Stage de seconde',
  };
}
