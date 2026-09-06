/**
 * The guard that makes a dead parameter fail a test instead of a conversation.
 *
 * This tier has one consumer, a language model, and it cannot read a cuid off a
 * screen. So a parameter no answer produces is not awkward, it is unusable - and
 * the failure is silent, because the operation is right there in the tool list and
 * refuses only when called with a value nobody could have. Two of those had
 * shipped: `ops_resolve_sync_errors.ids`, which no read has ever fed, and an event
 * id that for a leadership token existed only for events already over.
 *
 * The per-tier clause is the whole point. A handle produced by a core-only answer
 * is not reachable from a leadership token, and that exact hole had already
 * happened once and been patched by hand rather than closed.
 */

import { describe, it, expect } from 'vitest';
import {
  ADMIN_API_OPERATIONS,
  ADMIN_API_OPERATION_NAMES,
  isOperationAllowedForTier,
  type AdminApiOperationName,
  type AdminApiTier,
} from './operations';
import {
  HANDLES,
  PARAM_HANDLES,
  handleDescribe,
  handleProvenanceFr,
  handlesProvidedBy,
  handlesRequiredBy,
  type HandleKind,
} from './handles';

const TIERS: AdminApiTier[] = ['core', 'leadership'];

/**
 * Every parameter in the catalogue that names no thing.
 *
 * Listed rather than detected, so adding a parameter is a decision about whether
 * it can be obtained. A heuristic on the name would have passed `errorType` and
 * failed `publicName`, which is backwards.
 */
const PARAMS_THAT_NAME_NOTHING = new Set([
  // Closed enums naming a facet of the catalogue, not a row: 'staff' or
  // 'talent', and one of the three workspaces. There is nothing to obtain
  // them from because they are spelled out in the parameter's own schema.
  'audience',
  'space',
  // Scope vocabularies: a closed list published by meta_scope and refused by
  // value in scope.ts, which is this same job already done for those two.
  'campus',
  'schoolYear',
  'compareTo',
  // Free values an admin types.
  'publicName',
  'cohortNoun',
  'startTime',
  'endDate',
  'description',
  'reason',
  'label',
  // A certificate design. Authored rather than picked from anywhere, which is the
  // whole point of the table it is stored in.
  'styleCss',
  'bodyHtml',
  // A closing question and the composition of a grid. Same case: authored, not
  // picked, which is the whole point of the bank they are stored in. The one
  // value here that DOES name something is the question key a section references,
  // and that one is a handle.
  'kind',
  'hint',
  'max',
  'maxLength',
  'placeholder',
  'notePlaceholder',
  'testimonial',
  'retired',
  'options',
  'sections',
  // Flags, windows and sizes.
  'visible',
  'showStatutColumn',
  'pageWidthPx',
  'pageHeightPx',
  'onlyUpcoming',
  'days',
  'limit',
  'status',
  'state',
  'groupBy',
  // Echoed back from the operation own dry run.
  'planDigest',
]);

const paramsOf = (name: AdminApiOperationName) =>
  Object.keys(ADMIN_API_OPERATIONS[name].schema.shape);

/** A parameter's own `.describe()`, which is the other half of what it declares. */
const describedAs = (name: AdminApiOperationName, param: string): string => {
  const shape = ADMIN_API_OPERATIONS[name].schema.shape as Record<
    string,
    { description?: string }
  >;
  return shape[param]?.description ?? '';
};

describe('every parameter is classified', () => {
  it('is either a declared handle or listed as naming nothing', () => {
    const unclassified: string[] = [];
    for (const name of ADMIN_API_OPERATION_NAMES) {
      for (const param of paramsOf(name)) {
        if (PARAM_HANDLES[param]) continue;
        if (PARAMS_THAT_NAME_NOTHING.has(param)) continue;
        unclassified.push(`${name}.${param}`);
      }
    }
    // A new parameter lands here on purpose: decide whether something returns it,
    // then add it to PARAM_HANDLES or to PARAMS_THAT_NAME_NOTHING.
    expect(unclassified).toEqual([]);
  });

  it('declares no handle for a parameter no operation takes', () => {
    const used = new Set(ADMIN_API_OPERATION_NAMES.flatMap(paramsOf));
    const orphanParams = Object.keys(PARAM_HANDLES).filter(
      (param) => !used.has(param),
    );
    expect(orphanParams).toEqual([]);
  });
});

/**
 * A parameter declares its handle TWICE - once in `PARAM_HANDLES`, once in the
 * `handleDescribe()` embedded in its own `.describe()` - and nothing compared
 * them.
 *
 * That is the hole this closes, and it had shipped: `stats_closing_question`
 * named its parameter `question`, described it with the closing bank's handle,
 * and inherited the feedback form's from the map, because the map is keyed by
 * parameter name across the whole catalogue. Neither half looked wrong on its
 * own. The visible consequence was in `meta_operations`, the one surface a
 * leadership token discovers this tier through: it published a read that needed a
 * value only `stats_feedback_results` hands out, so the model went and fetched
 * the wrong one. The refusal that followed named the right producers - after the
 * call was spent, and counted as a refusal in `ops_api_usage`.
 *
 * Only parameters that embed a generated sentence are checked. A parameter may
 * legitimately carry a handle and describe itself in its own words instead
 * (`modules` enumerates the section keys, which is more useful than naming their
 * provenance); what it may not do is claim one handle's provenance while the map
 * claims another's.
 */
function describeMismatches(
  paramHandles: Record<string, HandleKind>,
): string[] {
  const kinds = Object.keys(HANDLES) as HandleKind[];
  const mismatches: string[] = [];
  for (const name of ADMIN_API_OPERATION_NAMES) {
    for (const param of paramsOf(name)) {
      const description = describedAs(name, param);
      const claimed = kinds.filter((kind) =>
        description.includes(handleDescribe(kind)),
      );
      if (claimed.length === 0) continue;
      const declared = paramHandles[param];
      if (declared && claimed.includes(declared)) continue;
      mismatches.push(
        `${name}.${param} describes ${claimed.join('/')} but PARAM_HANDLES says ${declared ?? 'nothing'}`,
      );
    }
  }
  return mismatches;
}

describe('a parameter declares one handle, not two', () => {
  it('maps every parameter to the handle its own describe names', () => {
    expect(describeMismatches(PARAM_HANDLES)).toEqual([]);
  });

  // Proof the check bites, in the exact shape that shipped: two operations
  // spelling two different things the same way.
  it('reports a parameter whose map entry and describe disagree', () => {
    const doctored = { ...PARAM_HANDLES, questionKey: 'questionKey' as const };

    const mismatches = describeMismatches(doctored);

    expect(mismatches.length).toBeGreaterThan(0);
    expect(
      mismatches.some((m) => m.includes('stats_closing_question.questionKey')),
    ).toBe(true);
  });
});

/**
 * The reachability check, written over an injected registry so it can be run
 * against a doctored one. A guard whose own logic is never exercised passes
 * forever, including after somebody breaks it, and that is the exact failure mode
 * it exists to prevent.
 */
function holesIn(handles: typeof HANDLES): string[] {
  const holes: string[] = [];
  for (const name of ADMIN_API_OPERATION_NAMES) {
    const operation = ADMIN_API_OPERATIONS[name];
    for (const param of paramsOf(name)) {
      const kind = PARAM_HANDLES[param];
      if (!kind) continue;
      const handle = handles[kind];
      if (handle.unobtainable) continue;

      for (const tier of TIERS) {
        if (!isOperationAllowedForTier(operation, tier)) continue;
        const reachable = handle.producedBy.some(({ operation: producer }) => {
          const read = ADMIN_API_OPERATIONS[producer];
          return read.kind === 'read' && isOperationAllowedForTier(read, tier);
        });
        if (!reachable) holes.push(`${name}.${param} (${kind}) for ${tier}`);
      }
    }
  }
  return holes;
}

describe('every handle is obtainable by whoever needs it', () => {
  it('has a producing read in each tier that can call the consumer', () => {
    expect(holesIn(HANDLES)).toEqual([]);
  });

  // Proof the check bites. Dropping the two producers that cover every event
  // leaves `stats_attendance_rate`, which returns past events only - the shape of
  // the hole that shipped, where the parameter looked reachable because something
  // did return it.
  it('reports a hole when the only producers left are core-only or partial', () => {
    const doctored = {
      ...HANDLES,
      eventId: {
        ...HANDLES.eventId,
        producedBy: HANDLES.eventId.producedBy.filter(
          (p) => p.operation === 'config_unconfigured_events',
        ),
      },
    };

    const holes = holesIn(doctored);

    expect(holes.length).toBeGreaterThan(0);
    // Core keeps a producer; leadership loses its last one.
    expect(holes.every((hole) => hole.endsWith('for leadership'))).toBe(true);
    expect(holes.some((hole) => hole.includes('stats_feedback_results'))).toBe(
      true,
    );
  });

  it('reports a hole when a handle has no producer and no stated reason', () => {
    const doctored = {
      ...HANDLES,
      eventId: { ...HANDLES.eventId, producedBy: [] },
    };

    expect(holesIn(doctored).length).toBeGreaterThan(0);
  });

  it('names a real read as producer, never a write', () => {
    for (const [kind, handle] of Object.entries(HANDLES) as [
      HandleKind,
      (typeof HANDLES)[HandleKind],
    ][]) {
      for (const { operation } of handle.producedBy) {
        expect(
          ADMIN_API_OPERATIONS[operation],
          `${kind}: unknown producer ${operation}`,
        ).toBeDefined();
        expect(
          ADMIN_API_OPERATIONS[operation].kind,
          `${kind}: ${operation} is a write, so it cannot be how a caller discovers a value`,
        ).toBe('read');
      }
    }
  });

  // An unobtainable handle is a defensible design - it is what keeps
  // ops_reset_closing from letting a model pick a victim - but it has to be a
  // decision somebody wrote down, because an oversight reads exactly the same.
  it('explains, in both languages, any handle nothing returns', () => {
    for (const [kind, handle] of Object.entries(HANDLES) as [
      HandleKind,
      (typeof HANDLES)[HandleKind],
    ][]) {
      if (handle.producedBy.length > 0) {
        expect(handle.unobtainable, `${kind} has producers`).toBeUndefined();
        continue;
      }
      expect(handle.unobtainable?.why, `${kind}`).toBeTruthy();
      expect(handle.unobtainable?.frSentence, `${kind}`).toBeTruthy();
    }
  });
});

describe('what the registry generates', () => {
  it('names every producer and its coverage caveat in the describe', () => {
    const text = handleDescribe('eventId');
    for (const { operation, covers } of HANDLES.eventId.producedBy) {
      expect(text).toContain(operation);
      if (covers) expect(text).toContain(covers);
    }
  });

  // The failure this replaces: three refusals naming three different subsets, and
  // none of them naming the operation that actually covered the common case.
  it('lists the same producers in the French refusal as in the describe', () => {
    const fr = handleProvenanceFr('eventId');
    for (const { operation } of HANDLES.eventId.producedBy) {
      expect(fr).toContain(operation);
    }
  });

  it('answers in French for a handle nothing returns, without naming an operation', () => {
    const fr = handleProvenanceFr('closingId');
    expect(fr).toContain('page des closings');
    expect(fr).not.toContain('ops_');
  });

  /**
   * The sentence is assembled, so its participle has to agree with a noun the
   * registry chooses. Half of them are feminine ("clés"), and a wrong agreement
   * is caught by nothing: it is only read, in French, by an admin being told
   * where a value comes from.
   */
  it('agrees with the gender of the noun it was given', () => {
    // "Les clés de question de closing sont RENVOYÉES par…"
    expect(handleProvenanceFr('closingQuestionKey')).toContain(
      'clés de question de closing sont renvoyées',
    );
    // "Les identifiants d'événement sont RENVOYÉS par…"
    expect(handleProvenanceFr('eventId')).toContain(
      "identifiants d'événement sont renvoyés",
    );
  });

  it('derives requires and provides for meta_operations', () => {
    expect(handlesRequiredBy(paramsOf('config_event_detail'))).toEqual([
      'eventId',
    ]);
    // The closing comparison needs a BANK key, not a feedback form's: this is the
    // pairing `meta_operations` got wrong, and it is what a leadership token
    // reads before choosing which operation to call first.
    expect(handlesRequiredBy(paramsOf('stats_closing_question'))).toEqual([
      'closingQuestionKey',
      'eventId',
    ]);
    // And it hands one back on the event axis, like its feedback twin.
    expect(handlesProvidedBy('stats_closing_question')).toContain('eventId');
    expect(handlesProvidedBy('config_events')).toContain('eventId');
    // A read that consumes a handle and produces none must not claim otherwise.
    expect(handlesProvidedBy('stats_cohort_profile')).toEqual([]);
  });
});
