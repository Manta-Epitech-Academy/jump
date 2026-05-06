/**
 * Parses inline quiz blocks from a Markdown document and strips them out.
 *
 * Each quiz lives in a top-level blockquote and starts with a line of the form
 *
 *   > QUIZ-<T>/<level>/<slug>/<index> <title>
 *
 * where T encodes the question type:
 *   - a digit N  ⇒ "exactly N correct answers among the listed options"
 *     (N=1 is single choice, N>1 is forced multi-N)
 *   - "M"        ⇒ matching pairs (uppercase letters ↔ lowercase letters)
 *   - "F"        ⇒ free-form input with a bracketed prompt
 *
 * The full grammar matches Kevin's proposal in workshop-metadata-tools
 * issue #3. The bullet marker (`-` vs `*`) is no longer load-bearing because
 * the type lives in the FQN — formatters that normalize bullet markers cannot
 * change the question type.
 *
 * The parser also returns the original Markdown with each quiz block replaced
 * by a `<div data-jump-quiz="...">` placeholder, so a downstream renderer can
 * mount an interactive component at the same position the quiz appeared.
 */

export type SingleChoiceOptions = {
  choices: { letter: string; text: string }[];
};

export type MatchOptions = {
  left: { letter: string; text: string }[];
  right: { letter: string; text: string }[];
};

export type FreeformOptions = {
  prompt: string;
};

export type QuizType = 'single' | 'multi' | 'match' | 'freeform';

export type ParsedQuiz = {
  fqn: string;
  type: QuizType;
  expectedCount: number | null;
  level: string;
  slug: string;
  externalIndex: number;
  title: string;
  question: string;
  options: SingleChoiceOptions | MatchOptions | FreeformOptions;
};

export type QuizParseError = {
  fqn?: string;
  line: number;
  message: string;
};

export type QuizParseResult = {
  blocks: ParsedQuiz[];
  strippedMd: string;
  errors: QuizParseError[];
};

const HEADER_RE =
  /^>\s*QUIZ-(?<t>\d+|M|F)\/(?<level>[A-Z]\d)\/(?<slug>[a-z][a-z0-9_-]*)\/(?<index>\d+)(?:\s+(?<title>.+))?\s*$/;
const FENCE_RE = /^(```|~~~)/;
const HEADING_RE = /^#{1,6}\s/;
const QUOTE_LINE_RE = /^>\s?(.*)$/;
const LIST_LINE_RE = /^[-*]\s+(.+)$/;
const SINGLE_CHOICE_RE = /^([A-Z])\.\s+(.+)$/;
const LOWER_CHOICE_RE = /^([a-z])\.\s+(.+)$/;
const FREEFORM_RE = /^\[(.+)\]\s*:\s*$/;

export function parseQuizBlocks(md: string): QuizParseResult {
  const lines = md.split(/\r?\n/);
  const blocks: ParsedQuiz[] = [];
  const errors: QuizParseError[] = [];
  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const headerMatch = line.match(HEADER_RE);
    if (!headerMatch) {
      out.push(line);
      continue;
    }

    const startLine = i;
    const groups = headerMatch.groups!;
    const fqn = `QUIZ-${groups.t}/${groups.level}/${groups.slug}/${groups.index}`;
    const title = (groups.title ?? '').trim();
    const tToken = groups.t;
    const type: QuizType =
      tToken === 'M'
        ? 'match'
        : tToken === 'F'
          ? 'freeform'
          : Number(tToken) === 1
            ? 'single'
            : 'multi';
    const expectedCount =
      tToken === 'M' || tToken === 'F' ? null : Number(tToken);

    if (expectedCount !== null && expectedCount < 1) {
      errors.push({
        fqn,
        line: startLine + 1,
        message: `T must be >= 1 in ${fqn}`,
      });
      // Skip this header and keep parsing.
      out.push(line);
      continue;
    }

    // Collect contiguous quoted lines as the question body.
    const questionLines: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const m = lines[j].match(QUOTE_LINE_RE);
      if (!m) break;
      questionLines.push(m[1]);
      j++;
    }

    // Skip blank lines between question and options.
    while (j < lines.length && lines[j].trim() === '') {
      j++;
    }

    // Collect option lines until block terminator.
    const optionLines: string[] = [];
    while (j < lines.length) {
      const cur = lines[j];
      if (cur.trim() === '') {
        // Blank line ends the option list unless followed by another list item.
        const next = lines[j + 1] ?? '';
        if (!LIST_LINE_RE.test(next)) {
          j++;
          break;
        }
        j++;
        continue;
      }
      if (cur.match(HEADER_RE) || HEADING_RE.test(cur) || FENCE_RE.test(cur)) {
        break;
      }
      const lm = cur.match(LIST_LINE_RE);
      if (!lm) {
        break;
      }
      optionLines.push(lm[1]);
      j++;
    }

    let parsed: ParsedQuiz | null = null;
    try {
      parsed = buildQuiz({
        fqn,
        type,
        expectedCount,
        level: groups.level,
        slug: groups.slug,
        externalIndex: Number(groups.index),
        title,
        question: questionLines.join('\n').trim(),
        optionLines,
      });
    } catch (err) {
      errors.push({
        fqn,
        line: startLine + 1,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    if (parsed) {
      blocks.push(parsed);
      out.push(`<div data-jump-quiz="${escapeAttr(parsed.fqn)}"></div>`);
    } else {
      // Preserve the source so the failure is visible in the rendered output.
      out.push(line);
      out.push(...questionLines.map((l) => `> ${l}`));
      out.push(...optionLines.map((l) => `- ${l}`));
    }

    i = j - 1;
  }

  return { blocks, strippedMd: out.join('\n'), errors };
}

type BuildQuizInput = {
  fqn: string;
  type: QuizType;
  expectedCount: number | null;
  level: string;
  slug: string;
  externalIndex: number;
  title: string;
  question: string;
  optionLines: string[];
};

function buildQuiz(input: BuildQuizInput): ParsedQuiz {
  const base = {
    fqn: input.fqn,
    type: input.type,
    expectedCount: input.expectedCount,
    level: input.level,
    slug: input.slug,
    externalIndex: input.externalIndex,
    title: input.title,
    question: input.question,
  };

  if (input.type === 'freeform') {
    if (input.optionLines.length !== 1) {
      throw new Error(
        `freeform quiz ${input.fqn} must have exactly one "- [prompt]:" line`,
      );
    }
    const m = input.optionLines[0].match(FREEFORM_RE);
    if (!m) {
      throw new Error(
        `freeform quiz ${input.fqn} body must match "- [<prompt>]:"`,
      );
    }
    return { ...base, options: { prompt: m[1].trim() } };
  }

  if (input.type === 'match') {
    const left: { letter: string; text: string }[] = [];
    const right: { letter: string; text: string }[] = [];
    for (const item of input.optionLines) {
      const upper = item.match(SINGLE_CHOICE_RE);
      const lower = item.match(LOWER_CHOICE_RE);
      if (upper) {
        left.push({ letter: upper[1], text: upper[2].trim() });
      } else if (lower) {
        right.push({ letter: lower[1], text: lower[2].trim() });
      } else {
        throw new Error(
          `match quiz ${input.fqn}: option "${item}" must start with "A.", "B.", "a.", "b."...`,
        );
      }
    }
    if (left.length === 0 || right.length === 0) {
      throw new Error(
        `match quiz ${input.fqn} needs both uppercase and lowercase rows`,
      );
    }
    if (left.length !== right.length) {
      throw new Error(
        `match quiz ${input.fqn}: left and right column row counts must match`,
      );
    }
    return { ...base, options: { left, right } };
  }

  // single / multi
  const choices: { letter: string; text: string }[] = [];
  for (const item of input.optionLines) {
    const m = item.match(SINGLE_CHOICE_RE);
    if (!m) {
      throw new Error(
        `quiz ${input.fqn}: option "${item}" must start with "A.", "B.", "C."...`,
      );
    }
    choices.push({ letter: m[1], text: m[2].trim() });
  }
  if (choices.length < 2) {
    throw new Error(`quiz ${input.fqn} needs at least 2 options`);
  }
  if (input.expectedCount !== null && input.expectedCount > choices.length) {
    throw new Error(
      `quiz ${input.fqn} expects ${input.expectedCount} correct answers but only ${choices.length} options provided`,
    );
  }
  return { ...base, options: { choices } };
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}
