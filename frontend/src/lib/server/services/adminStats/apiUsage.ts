/**
 * What this API is actually being asked, and by whom.
 *
 * The audit log reading itself. Plan 10 makes this the first operation to ship
 * for a reason: every decision after it (whether to open a PII tier, whether the
 * long tail of admin questions was real, which operations were speculation) is
 * gated on knowing what gets called, and until now that meant a psql session.
 *
 * A token is identified by its label and its owner's id, never by a name or an
 * email: this file obeys the same rule as the rest of the tier, including for
 * the staff behind the calls.
 */

import { prisma } from '$lib/server/db';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';

/** How far back the log can be read in one call. */
export const API_USAGE_MAX_DAYS = 180;
export const API_USAGE_DEFAULT_DAYS = 30;
/** Operations listed in the refusal ranking. */
export const REFUSAL_TOP_N = 10;

export type OperationUsage = {
  operation: string;
  calls: number;
  ok: number;
  refused: number;
  /** Share of this operation's own calls that were refused. */
  refusedShare: number | null;
  failed: number;
  lastCalledAt: string | null;
};

/**
 * A name a caller reached for that the catalogue does not have.
 *
 * The most direct evidence there is of a question this API cannot answer, and it
 * was already being recorded and never read: `auditUnreachedToolCall` logs a 404
 * against the invented name precisely so a model probing for an operation leaves a
 * trace. Reporting it is what turns "we found the gap by accident during a
 * demonstration" into something a team can watch.
 */
export type InventedOperation = { name: string; attempts: number };

export type TokenUsage = {
  /** The label its owner gave it. Null once the token has been deleted. */
  token: string | null;
  tier: string | null;
  calls: number;
  lastCalledAt: string | null;
};

export type DayUsage = { day: string; calls: number };

export type ApiUsage = {
  filters: { days: number };
  calls: Metric;
  okCalls: Metric;
  refusedCalls: Metric;
  failedCalls: Metric;
  refusalRate: Metric<number | null>;
  byOperation: Metric<OperationUsage[]>;
  byToken: Metric<TokenUsage[]>;
  byDay: Metric<DayUsage[]>;
  neverCalled: Metric<string[]>;
  mostRefused: Metric<OperationUsage[]>;
  inventedOperations: Metric<InventedOperation[]>;
};

const iso = (date: Date | null) => date?.toISOString() ?? null;

/**
 * `knownOperations` is passed in rather than imported from the catalogue: the
 * catalogue imports this service, so reaching back for it would close a cycle
 * whose constants are evaluated at module load.
 */
export async function getApiUsage(
  params: { days?: number } = {},
  knownOperations: string[] = [],
): Promise<ApiUsage> {
  const days = Math.min(
    Math.max(params.days ?? API_USAGE_DEFAULT_DAYS, 1),
    API_USAGE_MAX_DAYS,
  );
  const since = new Date(Date.now() - days * 86_400_000);
  const where = { createdAt: { gte: since } };

  const [rows, tokens] = await Promise.all([
    prisma.adminApi_Call.findMany({
      where,
      select: {
        operation: true,
        status: true,
        tokenId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.adminApi_Token.findMany({
      select: { id: true, label: true, tier: true },
    }),
  ]);

  const tokenById = new Map(tokens.map((t) => [t.id, t]));

  const byOperation = new Map<string, OperationUsage>();
  const byToken = new Map<string, TokenUsage>();
  const byDay = new Map<string, number>();
  let ok = 0;
  let refused = 0;
  let failed = 0;

  for (const row of rows) {
    // 2xx succeeded, 4xx was refused (bad scope, bad params, no right, quota),
    // 5xx is ours to fix. Told apart because they mean three different things
    // to whoever reads this: usage, friction, and a bug.
    if (row.status < 400) ok++;
    else if (row.status < 500) refused++;
    else failed++;

    const operation = byOperation.get(row.operation) ?? {
      operation: row.operation,
      calls: 0,
      ok: 0,
      refused: 0,
      refusedShare: null,
      failed: 0,
      lastCalledAt: iso(row.createdAt),
    };
    operation.calls++;
    if (row.status < 400) operation.ok++;
    else if (row.status < 500) operation.refused++;
    else operation.failed++;
    byOperation.set(row.operation, operation);

    const key = row.tokenId ?? 'session';
    const token = byToken.get(key) ?? {
      token: row.tokenId ? (tokenById.get(row.tokenId)?.label ?? null) : null,
      tier: row.tokenId ? (tokenById.get(row.tokenId)?.tier ?? null) : null,
      calls: 0,
      lastCalledAt: iso(row.createdAt),
    };
    token.calls++;
    byToken.set(key, token);

    const day = row.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const called = new Set(rows.map((r) => r.operation));
  const known = new Set(knownOperations);

  // Computed after the loop, once each operation has its totals: a refusal rate
  // per operation is what tells a widely-used tool with a hard filter apart from
  // one nobody can call correctly, which the global rate cannot.
  const operations = [...byOperation.values()].map((row) => ({
    ...row,
    refusedShare: share(row.refused, row.calls),
  }));

  // An operation name that is not in the catalogue was invented by a caller. The
  // envelope audit records those, so they are the questions somebody tried to ask
  // and could not. `mcp_request` is not one of them: it is the name the endpoint
  // logs an authentication failure under, before any tool is named.
  const invented = operations
    .filter(
      (row) => !known.has(row.operation) && row.operation !== 'mcp_request',
    )
    .map((row) => ({ name: row.operation, attempts: row.calls }))
    .sort((a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name));

  return {
    filters: { days },
    calls: metric(
      rows.length,
      `Appels à l'API d'administration enregistrés sur les ${days} derniers jours, réussites et refus confondus. Chaque appel, quel qu'en soit le résultat, laisse une ligne : c'est ce journal qui remplace une restriction a priori.`,
    ),
    okCalls: metric(ok, 'Appels ayant abouti à une réponse.'),
    refusedCalls: metric(
      refused,
      "Appels refusés : périmètre inconnu, paramètre non reconnu, droit manquant ou quota atteint. Un chiffre élevé signale une difficulté d'usage, pas une panne.",
    ),
    failedCalls: metric(
      failed,
      "Appels ayant échoué côté Jump (erreur interne). Tout chiffre non nul mérite d'être regardé.",
    ),
    refusalRate: metric(
      share(refused, rows.length),
      "Part des appels refusés, en pourcentage du total de la période. Vaut null si aucun appel n'a été enregistré.",
    ),
    byOperation: metric(
      [...operations].sort((a, b) => b.calls - a.calls),
      "Nombre d'appels par opération, de la plus à la moins demandée, avec le détail réussites / refus / erreurs, la part de refus de cette opération et la date du dernier appel.",
    ),
    byToken: metric(
      [...byToken.values()].sort((a, b) => b.calls - a.calls),
      "Nombre d'appels par token, du plus au moins actif. « token » est le nom donné par son propriétaire ; il vaut null pour les appels faits depuis une session d'administration ouverte dans le navigateur, ou par un token supprimé depuis.",
    ),
    byDay: metric(
      [...byDay.entries()]
        .map(([day, calls]) => ({ day, calls }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      "Nombre d'appels par jour (date UTC), du plus ancien au plus récent.",
    ),
    neverCalled: metric(
      knownOperations.filter((name) => !called.has(name)).sort(),
      "Opérations du catalogue que personne n'a appelées sur la période. Une opération qui n'en sort jamais est une opération que le catalogue peut perdre.",
    ),
    mostRefused: metric(
      operations
        .filter((row) => row.refused > 0)
        .sort(
          (a, b) =>
            (b.refusedShare ?? 0) - (a.refusedShare ?? 0) ||
            b.refused - a.refused,
        )
        .slice(0, REFUSAL_TOP_N),
      `Les opérations dont la part de refus est la plus forte, au maximum ${REFUSAL_TOP_N} lignes. À lire avec « calls » : une part élevée sur deux appels est une erreur de frappe, la même part sur deux cents appels est une question que le catalogue pose mal, un filtre qui manque ou un identifiant que rien ne renvoie.`,
    ),
    inventedOperations: metric(
      invented,
      "Noms d'opération demandés qui n'existent pas dans le catalogue, du plus au moins tenté. C'est la trace la plus directe d'une question à laquelle cette API ne sait pas répondre : quelqu'un a cherché un outil sous un nom qu'il a imaginé. Un nom qui revient mérite soit une opération, soit une description qui dirige mieux vers celle qui existe déjà.",
    ),
  };
}
