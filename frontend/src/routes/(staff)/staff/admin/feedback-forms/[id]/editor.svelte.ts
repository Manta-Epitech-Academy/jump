import { toast } from 'svelte-sonner';
import { SvelteMap } from 'svelte/reactivity';
import type {
  QuestionType,
  InputKind,
  IdentityField,
} from '$lib/domain/feedbackForms/schema';
import type {
  EditorOption,
  EditorQuestion,
  EditorSection,
  EditorOptionKind,
} from '$lib/domain/feedbackForms/projectToSchema';

export type SaveState = 'saving' | 'saved' | 'error';
export type FormStatus = 'draft' | 'published' | 'archived';

export interface FormMeta {
  title: string;
  intro: string;
  personaName: string | null;
  status: FormStatus;
  allowsAuthenticatedAccess: boolean;
  allowsPublicAccess: boolean;
  dashboardNudge: boolean;
}

export interface SectionGroup {
  section: EditorSection | null;
  questions: EditorQuestion[];
}

type Init = {
  formId: string;
  slug: string;
  locked: boolean;
  meta: FormMeta;
  sections: EditorSection[];
  questions: EditorQuestion[];
};

/** Reorders `list` in place so its items follow `fromId` → just past `overId`. */
function moveWithin<T extends { id: string }>(
  list: T[],
  fromId: string,
  overId: string,
): void {
  const from = list.findIndex((x) => x.id === fromId);
  const over = list.findIndex((x) => x.id === overId);
  if (from === -1 || over === -1 || from === over) return;
  const [item] = list.splice(from, 1);
  if (!item) return;
  const over2 = list.findIndex((x) => x.id === overId);
  list.splice(from < over ? over2 + 1 : over2, 0, item);
}

function restoreOrder<T extends { id: string }>(
  list: T[],
  ids: string[],
): void {
  list.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Client controller for the Google-Forms-style feedback builder.
 *
 * Owns the whole form (meta + section/question/option graph) as local `$state`
 * and applies every edit OPTIMISTICALLY: the UI updates instantly, the REST call
 * fires in the background, a failure rolls it back with a toast. Nothing re-fetches
 * the page, so the document never reflows or steals focus while typing.
 *
 * `questions` is kept in flattened-grouped order at all times (unsectioned first,
 * then sections by position, intra-order preserved) so the document render, the
 * runtime projection, and reorder commits all agree. A concurrent submission that
 * locks the form surfaces as a 409 → `lockedByServer`, flipping the UI read-only.
 */
export class FormEditor {
  readonly formId: string;
  readonly slug: string;

  // ── Form meta (auto-saved, like Forms: no submit button) ──
  title = $state('');
  intro = $state('');
  personaName = $state<string | null>(null);
  status = $state<FormStatus>('draft');
  allowsAuthenticatedAccess = $state(false);
  allowsPublicAccess = $state(false);
  dashboardNudge = $state(false);

  // ── Structure ──
  sections = $state<EditorSection[]>([]);
  questions = $state<EditorQuestion[]>([]);

  /** Per-entity save state, keyed by section/question/option id (or a synthetic key). */
  status_ = new SvelteMap<string, SaveState>();
  inflight = $state(0);
  lastSavedAt = $state<number | null>(null);

  /** The single selected/expanded card (Forms shows one active card at a time). */
  activeId = $state<string | null>(null);
  /** Id of the most recently added question, so its card mounts expanded. */
  lastAddedId = $state<string | null>(null);

  #lockedInitial: boolean;
  lockedByServer = $state(false);
  #orderSnapshot: string[] | null = null;

  constructor(init: Init) {
    this.formId = init.formId;
    this.slug = init.slug;
    this.#lockedInitial = init.locked;
    Object.assign(this, init.meta);
    this.sections = init.sections;
    this.questions = init.questions;
    this.reflow();
  }

  get locked(): boolean {
    return this.#lockedInitial || this.lockedByServer;
  }
  get baseUrl(): string {
    return `/staff/admin/feedback-forms/${this.formId}`;
  }

  /**
   * True while any row's last save failed and hasn't been retried. The header
   * indicator reads this so it never claims "Enregistré" over a live failure
   * (the per-row dot and a toast also surface it). A retry sets the row back to
   * `saving` then `saved`, clearing this.
   */
  get hasError(): boolean {
    for (const state of this.status_.values()) {
      if (state === 'error') return true;
    }
    return false;
  }

  /** The document as ordered groups: leading unsectioned questions, then each section. */
  get groups(): SectionGroup[] {
    const bySection = new Map<string | null, EditorQuestion[]>();
    for (const q of this.questions) {
      const list = bySection.get(q.sectionId) ?? [];
      list.push(q);
      bySection.set(q.sectionId, list);
    }
    const out: SectionGroup[] = [];
    const unsectioned = bySection.get(null) ?? [];
    if (unsectioned.length) out.push({ section: null, questions: unsectioned });
    for (const s of [...this.sections].sort(
      (a, b) => a.position - b.position,
    )) {
      out.push({ section: s, questions: bySection.get(s.id) ?? [] });
    }
    return out;
  }

  setActive(id: string | null) {
    this.activeId = id;
  }

  #q(id: string) {
    return this.questions.find((q) => q.id === id);
  }
  #s(id: string) {
    return this.sections.find((s) => s.id === id);
  }

  /** Keeps `questions` in flattened-grouped order and renumbers positions. */
  reflow() {
    const rank = (sectionId: string | null): number => {
      if (sectionId === null) return -1;
      return this.#s(sectionId)?.position ?? Number.MAX_SAFE_INTEGER;
    };
    const indexed = this.questions.map((q, i) => ({ q, i }));
    indexed.sort(
      (a, b) => rank(a.q.sectionId) - rank(b.q.sectionId) || a.i - b.i,
    );
    const sorted = indexed.map((x) => x.q);
    this.questions.splice(0, this.questions.length, ...sorted);
    this.questions.forEach((q, i) => (q.position = i));
  }

  #flashSaved(id: string) {
    this.status_.set(id, 'saved');
    this.lastSavedAt = Date.now();
    setTimeout(() => {
      if (this.status_.get(id) === 'saved') this.status_.delete(id);
    }, 1600);
  }

  async #send(
    id: string,
    path: string,
    method: string,
    body?: unknown,
  ): Promise<unknown | null> {
    this.status_.set(id, 'saving');
    this.inflight++;
    try {
      const res = await fetch(`${this.baseUrl}/${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        if (res.status === 409) this.lockedByServer = true;
        const b = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        toast.error(b?.message ?? 'Une erreur est survenue.');
        this.status_.set(id, 'error');
        return null;
      }
      this.#flashSaved(id);
      return await res.json().catch(() => ({}));
    } catch {
      toast.error('Une erreur réseau est survenue.');
      this.status_.set(id, 'error');
      return null;
    } finally {
      this.inflight--;
    }
  }

  // ── Form meta ──

  async patchForm(patch: Partial<FormMeta>): Promise<void> {
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) prev[k] = (this as never)[k];
    Object.assign(this, patch);
    const ok = await this.#send('form:meta', 'meta', 'PATCH', patch);
    if (ok === null) Object.assign(this, prev);
  }

  // ── Questions ──

  async addQuestion(
    opts: { afterId?: string; sectionId?: string | null } = {},
  ): Promise<string | null> {
    const key = `q_${Date.now().toString(36)}`;
    let sectionId: string | null = opts.sectionId ?? null;
    let insertIndex = this.questions.length;

    if (opts.afterId) {
      const i = this.questions.findIndex((q) => q.id === opts.afterId);
      if (i !== -1) {
        insertIndex = i + 1;
        sectionId = this.questions[i].sectionId;
      }
    } else if (opts.sectionId) {
      const idxs = this.questions
        .map((q, i) => (q.sectionId === opts.sectionId ? i : -1))
        .filter((i) => i >= 0);
      insertIndex = idxs.length
        ? idxs[idxs.length - 1] + 1
        : this.questions.length;
    }

    const created = (await this.#send('add:question', 'questions', 'POST', {
      key,
      prompt: 'Nouvelle question',
      type: 'single',
      required: true,
      sectionId,
      position: insertIndex,
    })) as { id: string } | null;
    if (!created) return null;

    this.lastAddedId = created.id;
    this.questions.splice(insertIndex, 0, {
      id: created.id,
      key,
      position: insertIndex,
      sectionId,
      prompt: 'Nouvelle question',
      type: 'single',
      required: true,
      identityField: null,
      inputKind: null,
      minSelections: null,
      maxSelections: null,
      placeholder: null,
      options: [],
    });
    this.reflow();
    this.setActive(created.id);
    return created.id;
  }

  async patchQuestion(
    id: string,
    patch: Partial<EditorQuestion>,
  ): Promise<void> {
    const q = this.#q(id);
    if (!q) return;
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) prev[k] = (q as never)[k];
    Object.assign(q, patch);
    const ok = await this.#send(id, `questions/${id}`, 'PATCH', patch);
    if (ok === null) Object.assign(q, prev);
  }

  /** Reassigns a question to another section (or none) and re-persists the order. */
  async moveQuestionToSection(
    id: string,
    sectionId: string | null,
  ): Promise<void> {
    const q = this.#q(id);
    if (!q || q.sectionId === sectionId) return;
    const prev = q.sectionId;
    q.sectionId = sectionId;
    this.reflow();
    const ok = await this.#send(id, `questions/${id}`, 'PATCH', { sectionId });
    if (ok === null) {
      q.sectionId = prev;
      this.reflow();
      return;
    }
    await this.#persistQuestionOrder();
  }

  async deleteQuestion(id: string): Promise<void> {
    const i = this.questions.findIndex((q) => q.id === id);
    if (i === -1) return;
    const [removed] = this.questions.splice(i, 1);
    if (this.activeId === id) this.activeId = null;
    const ok = await this.#send(id, `questions/${id}`, 'DELETE');
    if (ok === null) {
      this.questions.splice(i, 0, removed);
      this.reflow();
    }
  }

  async duplicateQuestion(id: string): Promise<void> {
    const i = this.questions.findIndex((q) => q.id === id);
    if (i === -1) return;
    const created = (await this.#send(
      id,
      `questions/${id}/duplicate`,
      'POST',
    )) as EditorQuestion | null;
    if (!created) return;
    this.questions.splice(i + 1, 0, created);
    this.reflow();
    this.setActive(created.id);
  }

  // ── Sections ──

  async addSection(): Promise<void> {
    const created = (await this.#send('add:section', 'sections', 'POST', {
      title: 'Nouvelle section',
    })) as { id: string } | null;
    if (!created) return;
    this.sections.push({
      id: created.id,
      title: 'Nouvelle section',
      intro: null,
      position: this.sections.length,
    });
  }

  async patchSection(id: string, patch: Partial<EditorSection>): Promise<void> {
    const s = this.#s(id);
    if (!s) return;
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) prev[k] = (s as never)[k];
    Object.assign(s, patch);
    const ok = await this.#send(id, `sections/${id}`, 'PATCH', patch);
    if (ok === null) Object.assign(s, prev);
  }

  async deleteSection(id: string): Promise<void> {
    const i = this.sections.findIndex((s) => s.id === id);
    if (i === -1) return;
    const [removed] = this.sections.splice(i, 1);
    // The FK is SetNull, so the section's questions survive as unsectioned.
    const detached = this.questions.filter((q) => q.sectionId === id);
    for (const q of detached) q.sectionId = null;
    this.reflow();
    const ok = await this.#send(id, `sections/${id}`, 'DELETE');
    if (ok === null) {
      this.sections.splice(i, 0, removed);
      for (const q of detached) q.sectionId = id;
      this.reflow();
      return;
    }
    await this.#persistQuestionOrder();
  }

  /** Moves a whole section (and its question block) up or down among sections. */
  async moveSectionBy(id: string, dir: -1 | 1): Promise<void> {
    const sorted = [...this.sections].sort((a, b) => a.position - b.position);
    const i = sorted.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    const pa = a.position;
    const pb = b.position;
    a.position = pb;
    b.position = pa;
    this.reflow();
    const ids = [...this.sections]
      .sort((x, y) => x.position - y.position)
      .map((s) => s.id);
    const ok = await this.#send('reorder:sections', 'reorder', 'POST', {
      target: 'sections',
      ids,
    });
    if (ok === null) {
      a.position = pa;
      b.position = pb;
      this.reflow();
      return;
    }
    await this.#persistQuestionOrder();
  }

  // ── Options ──

  async addOption(qid: string): Promise<void> {
    const q = this.#q(qid);
    if (!q) return;
    const created = (await this.#send(qid, `questions/${qid}/options`, 'POST', {
      label: 'Option',
      kind: 'choice',
    })) as { id: string } | null;
    if (!created) return;
    q.options.push({
      id: created.id,
      label: 'Option',
      kind: 'choice',
      position: q.options.length,
    });
  }

  async patchOption(
    qid: string,
    oid: string,
    patch: Partial<EditorOption>,
  ): Promise<void> {
    const q = this.#q(qid);
    const o = q?.options.find((x) => x.id === oid);
    if (!o) return;
    const prev: Record<string, unknown> = {};
    for (const k of Object.keys(patch)) prev[k] = (o as never)[k];
    Object.assign(o, patch);
    const ok = await this.#send(
      oid,
      `questions/${qid}/options/${oid}`,
      'PATCH',
      patch,
    );
    if (ok === null) Object.assign(o, prev);
  }

  async deleteOption(qid: string, oid: string): Promise<void> {
    const q = this.#q(qid);
    if (!q) return;
    const i = q.options.findIndex((x) => x.id === oid);
    if (i === -1) return;
    const [removed] = q.options.splice(i, 1);
    const ok = await this.#send(
      oid,
      `questions/${qid}/options/${oid}`,
      'DELETE',
    );
    if (ok === null) q.options.splice(i, 0, removed);
  }

  // ── Reordering (drag within a section + keyboard) ──

  snapshotQuestions() {
    this.#orderSnapshot = this.questions.map((q) => q.id);
  }
  moveQuestion(fromId: string, overId: string) {
    moveWithin(this.questions, fromId, overId);
  }
  async commitQuestions(): Promise<void> {
    const before = this.#orderSnapshot;
    this.#orderSnapshot = null;
    const ids = this.questions.map((q) => q.id);
    if (!before || sameOrder(before, ids)) return;
    const ok = await this.#persistQuestionOrder();
    if (ok === null) {
      restoreOrder(this.questions, before);
      this.reflow();
    }
  }
  async nudgeQuestion(id: string, dir: -1 | 1): Promise<void> {
    // Move within the question's own section group only.
    const same = this.questions.filter(
      (q) => q.sectionId === this.#q(id)?.sectionId,
    );
    const gi = same.findIndex((q) => q.id === id);
    const gj = gi + dir;
    if (gi === -1 || gj < 0 || gj >= same.length) return;
    this.snapshotQuestions();
    moveWithin(this.questions, id, same[gj].id);
    await this.commitQuestions();
  }

  async #persistQuestionOrder(): Promise<unknown | null> {
    this.questions.forEach((q, i) => (q.position = i));
    return this.#send('reorder:questions', 'reorder', 'POST', {
      target: 'questions',
      ids: this.questions.map((q) => q.id),
    });
  }

  snapshotOptions(qid: string) {
    this.#orderSnapshot = this.#q(qid)?.options.map((o) => o.id) ?? null;
  }
  moveOption(qid: string, fromId: string, overId: string) {
    const q = this.#q(qid);
    if (q) moveWithin(q.options, fromId, overId);
  }
  async commitOptions(qid: string): Promise<void> {
    const before = this.#orderSnapshot;
    this.#orderSnapshot = null;
    const q = this.#q(qid);
    if (!q) return;
    const ids = q.options.map((o) => o.id);
    if (!before || sameOrder(before, ids)) return;
    q.options.forEach((o, i) => (o.position = i));
    const ok = await this.#send('reorder:options', 'reorder', 'POST', {
      target: 'options',
      ids,
    });
    if (ok === null) restoreOrder(q.options, before);
  }
  async nudgeOption(qid: string, id: string, dir: -1 | 1): Promise<void> {
    const q = this.#q(qid);
    if (!q) return;
    const i = q.options.findIndex((o) => o.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= q.options.length) return;
    this.snapshotOptions(qid);
    const [item] = q.options.splice(i, 1);
    q.options.splice(j, 0, item);
    await this.commitOptions(qid);
  }
}

export type { EditorOption, EditorQuestion, EditorSection, EditorOptionKind };
export type { QuestionType, InputKind, IdentityField };
