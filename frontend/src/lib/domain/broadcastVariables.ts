import {
  BROADCAST_VARIABLES,
  type BroadcastVariableKey,
} from '$lib/domain/broadcasts';

export interface VariableContext {
  prenom: string;
  nom: string;
  email: string | null;
  phone: string | null;
  campus: string;
  event_name: string | null;
  fastlogin_link: string | null;
  otp_code: string | null;
}

export function buildDemoContext(eventName?: string | null): VariableContext {
  const demo = Object.fromEntries(
    BROADCAST_VARIABLES.map((v) => [v.key, v.demo]),
  ) as Record<BroadcastVariableKey, string>;
  return {
    ...demo,
    event_name: eventName ?? demo.event_name,
  };
}

const TOKEN_RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

export function substituteVariables(
  text: string,
  ctx: VariableContext,
): string {
  return text.replace(TOKEN_RE, (_match, rawKey) => {
    const key = rawKey.toLowerCase() as keyof VariableContext;
    if (!(key in ctx)) return '';
    const value = ctx[key];
    return value ?? '';
  });
}

export function findUnknownTokens(text: string): string[] {
  const found = new Set<string>();
  const known = new Set(BROADCAST_VARIABLES.map((v) => v.key));
  for (const match of text.matchAll(TOKEN_RE)) {
    const key = match[1].toLowerCase();
    if (!known.has(key as BroadcastVariableKey)) found.add(key);
  }
  return [...found];
}
