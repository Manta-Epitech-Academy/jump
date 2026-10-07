import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';

/**
 * A feedback form authored over the API: read whole, written whole, copied.
 *
 * Driven through the HTTP wrapper, the way a token calls it, because the strict
 * nested schema is half of what is under test: an `optionId` misspelt and
 * silently dropped would turn an option rename into a new option, which on a
 * form with responses is exactly the edit the lock exists to refuse.
 *
 * What these assert is the contract the PO relies on: what reads back is what
 * was written, an option renamed under its id keeps the answers given to it, a
 * structural edit on an answered form is refused with the way out, nothing is
 * written when anything is refused, and a persona icon is copied once.
 *
 * Storage, the image pipeline and the address policy are stubbed for the
 * reasons `workshopCover.integration.test.ts` gives: the pipeline is `Bun.Image`,
 * which vitest's Node runner does not have, and the address policy refuses the
 * loopback host the picture is served from.
 */
const objects = new Map<string, Uint8Array>();

vi.mock('$lib/server/infra/storage', () => ({
  getStorage: () => ({
    save: async (key: string, data: Uint8Array) => {
      objects.set(key, data);
      return key;
    },
    get: async (key: string) => {
      const data = objects.get(key);
      if (!data) throw new Error(`Object not found: ${key}`);
      return Buffer.from(data);
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
    getDownloadUrl: async (key: string) => `https://example.invalid/${key}`,
  }),
  isObjectNotFound: () => false,
}));

vi.mock('$lib/server/infra/publicAddress', () => ({
  isPublicAddress: vi.fn(() => true),
}));

vi.mock('$lib/server/images/process', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('$lib/server/images/process')>();
  return {
    ...actual,
    processImage: vi.fn(async (input: Uint8Array) => ({
      bytes: input,
      contentType: 'image/webp' as const,
      width: 256,
      height: 256,
    })),
  };
});

const { mintToken } = await import('$lib/server/adminApi/tokens');
const { adminApiWrite } = await import('$lib/server/adminApi/route');
const { ADMIN_API_OPERATIONS } =
  await import('$lib/server/adminApi/operations');

const postForm = adminApiWrite('write_feedback_form');
const postCopy = adminApiWrite('write_feedback_form_copy');

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (seed: number) => new Uint8Array([...PNG_MAGIC, seed, seed, seed]);

type Payload = Record<string, unknown> & {
  error?: string;
  planDigest?: string;
  formId?: string;
  form?: FormRead;
};
type OptionRead = {
  optionId: string;
  label: string;
  kind: string;
  reaction: string | null;
};
type QuestionRead = { key: string; prompt: string; options: OptionRead[] };
type FormRead = {
  formId: string;
  title: string;
  status: string;
  locked: boolean;
  personaIcon: { sourceUrl: string | null } | null;
  questions: QuestionRead[];
  sections: { sectionId: string; title: string; questions: QuestionRead[] }[];
};

async function call(
  handler: RequestHandler,
  secret: string,
  body: unknown,
): Promise<{ status: number; payload: Payload }> {
  const request = new Request(
    'http://localhost/api/admin/write/feedback-form',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    },
  );
  const response = await handler({
    request,
    url: new URL(request.url),
    locals: {} as App.Locals,
  } as RequestEvent);
  return { status: response.status, payload: await response.json() };
}

async function readForm(formId: string): Promise<FormRead> {
  const answer = (await ADMIN_API_OPERATIONS.config_feedback_forms.run(
    { formId },
    { tier: 'core', actorUserId: 'test', origin: 'http://localhost' },
  )) as { form: { value: FormRead } };
  return answer.form.value;
}

/** The read, turned back into what the write takes. */
function asWrite(form: FormRead & Record<string, unknown>) {
  const {
    formId,
    title,
    intro,
    outro,
    personaName,
    status,
    allowsAuthenticatedAccess,
    allowsPublicAccess,
    dashboardNudge,
    questions,
    sections,
  } = form;
  return {
    formId,
    title,
    intro,
    outro,
    personaName,
    status,
    allowsAuthenticatedAccess,
    allowsPublicAccess,
    dashboardNudge,
    questions,
    sections,
  };
}

describe('feedback forms authored over the API (integration)', () => {
  const stamp = Date.now();
  const title = (name: string) => `Auteur-${stamp} ${name}`;

  let server: Server;
  let host = '';
  let requests = 0;
  let secret = '';
  let adminUserId = '';

  /** Dry run, then apply with the digest it returned. */
  async function write(body: Record<string, unknown>) {
    const dry = await call(postForm, secret, body);
    expect(dry.status, String(dry.payload.error)).toBe(200);
    expect(dry.payload.applied).toBe(false);
    return call(postForm, secret, {
      ...body,
      planDigest: dry.payload.planDigest,
    });
  }

  const baseForm = (name: string) => ({
    title: title(name),
    intro: 'Salut {prenom} !',
    status: 'draft',
    allowsAuthenticatedAccess: true,
    allowsPublicAccess: false,
    dashboardNudge: false,
    questions: [
      {
        key: 'avis',
        prompt: 'Ton avis ?',
        type: 'scale',
        options: [
          { label: 'Top' },
          { label: 'Bof' },
          { label: 'Je ne sais pas', kind: 'extra' },
        ],
      },
    ],
    sections: [
      {
        title: 'Ta semaine',
        questions: [
          { key: 'mot', prompt: 'Un mot ?', type: 'text', required: false },
        ],
      },
    ],
  });

  async function submitTo(formId: string) {
    const option = await prisma.feedback_QuestionOption.findFirstOrThrow({
      where: { question: { formId, key: 'avis' } },
      orderBy: { position: 'asc' },
    });
    await prisma.feedback_Submission.create({
      data: {
        formId,
        source: 'public',
        respondentEmail: `repondant.${stamp}@example.invalid`,
        answers: {
          create: {
            questionId: option.questionId,
            selectedOptions: { create: { optionId: option.id } },
          },
        },
      },
    });
  }

  beforeAll(async () => {
    assertTestDatabase();
    server = createServer((req, res) => {
      requests++;
      if (req.url === '/canard.png') {
        res.writeHead(200).end(Buffer.from(png(1)));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const admin = await createAdminAccount(`authoring.${stamp}@epitech.eu`);
    adminUserId = admin.id;
    secret = (
      await mintToken(adminUserId, { label: 'Écriture', writeEnabled: true })
    ).secret;
  });

  beforeEach(() => {
    requests = 0;
  });

  afterAll(async () => {
    try {
      const forms = await prisma.feedback_Form.findMany({
        where: { title: { startsWith: `Auteur-${stamp}` } },
        select: { id: true },
      });
      const ids = forms.map((f) => f.id);
      await prisma.feedback_Submission.deleteMany({
        where: { formId: { in: ids } },
      });
      await prisma.feedback_Form.deleteMany({ where: { id: { in: ids } } });
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.bauth_user.deleteMany({ where: { id: adminUserId } });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates a form only once the plan is applied, and reads it back as written', async () => {
    const body = baseForm('création');
    const dry = await call(postForm, secret, body);
    expect(dry.payload.applied).toBe(false);
    expect(
      await prisma.feedback_Form.count({ where: { title: body.title } }),
    ).toBe(0);

    const applied = await call(postForm, secret, {
      ...body,
      planDigest: dry.payload.planDigest,
    });
    expect(applied.status, String(applied.payload.error)).toBe(200);
    const formId = applied.payload.formId!;

    const read = await readForm(formId);
    expect(read.title).toBe(body.title);
    expect(read.questions.map((q) => q.key)).toEqual(['avis']);
    expect(read.questions[0].options.map((o) => [o.label, o.kind])).toEqual([
      ['Top', 'choice'],
      ['Bof', 'choice'],
      ['Je ne sais pas', 'extra'],
    ]);
    expect(read.sections.map((s) => s.title)).toEqual(['Ta semaine']);
    expect(read.sections[0].questions.map((q) => q.key)).toEqual(['mot']);
    expect(applied.payload.form).toEqual(read);

    // The audit row keeps both states, and the creation has nothing before it.
    const row = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'write_feedback_form' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.before).toBeNull();
    expect(row?.after).toMatchObject({ formId, title: body.title });
  });

  it('restructures a form nobody has answered, matching rows by identity', async () => {
    const created = await write(baseForm('libre'));
    const read = await readForm(created.payload.formId!);
    const [top, , extra] = read.questions[0].options;

    const edited = {
      ...asWrite(read as FormRead & Record<string, unknown>),
      questions: [
        {
          ...read.questions[0],
          options: [{ ...extra }, { ...top, label: 'Génial' }],
        },
      ],
      sections: [
        ...read.sections,
        {
          title: 'Et après',
          questions: [
            {
              key: 'suite',
              prompt: 'Tu reviens ?',
              type: 'single',
              options: [{ label: 'Oui' }, { label: 'Non' }],
            },
          ],
        },
      ],
    };
    const applied = await write(edited);
    expect(applied.status, String(applied.payload.error)).toBe(200);

    const after = await readForm(read.formId);
    expect(after.questions[0].options.map((o) => o.label)).toEqual([
      'Je ne sais pas',
      'Génial',
    ]);
    // Kept rows keep their ids; the dropped option is gone.
    expect(after.questions[0].options.map((o) => o.optionId)).toEqual([
      extra.optionId,
      top.optionId,
    ]);
    expect(after.sections.map((s) => s.title)).toEqual([
      'Ta semaine',
      'Et après',
    ]);
    expect(after.sections[1].questions[0].key).toBe('suite');
  });

  it('lets an answered form change its wording and keeps the answers on the renamed option', async () => {
    const created = await write(baseForm('verrou'));
    const formId = created.payload.formId!;
    await submitTo(formId);
    const read = await readForm(formId);
    expect(read.locked).toBe(true);
    const [top, ...rest] = read.questions[0].options;

    const applied = await write({
      ...asWrite(read as FormRead & Record<string, unknown>),
      status: 'published',
      questions: [
        {
          ...read.questions[0],
          prompt: 'Ton avis, franchement ?',
          options: [{ ...top, label: 'Au top', reaction: 'Merci !' }, ...rest],
        },
      ],
    });
    expect(applied.status, String(applied.payload.error)).toBe(200);

    const answered = await prisma.feedback_AnswerOption.findFirstOrThrow({
      where: { option: { question: { formId } } },
      select: { option: { select: { id: true, label: true } } },
    });
    expect(answered.option).toEqual({ id: top.optionId, label: 'Au top' });
  });

  it('refuses a structural edit on an answered form, says how to proceed, and writes nothing', async () => {
    const created = await write(baseForm('refus'));
    const formId = created.payload.formId!;
    await submitTo(formId);
    const read = await readForm(formId);

    const refused = await call(postForm, secret, {
      ...asWrite(read as FormRead & Record<string, unknown>),
      title: title('refus renommé'),
      questions: [
        ...read.questions,
        { key: 'nouvelle', prompt: 'Encore ?', type: 'text' },
      ],
    });
    expect(refused.status).toBe(400);
    expect(refused.payload.error).toContain('question « nouvelle » ajoutée');
    expect(refused.payload.error).toContain('write_feedback_form_copy');
    expect(await readForm(formId)).toEqual(read);
  });

  it('refuses an apply once the form has been answered since the plan', async () => {
    const created = await write(baseForm('répondu entre-temps'));
    const formId = created.payload.formId!;
    const read = await readForm(formId);
    const body = {
      ...asWrite(read as FormRead & Record<string, unknown>),
      questions: [],
    };

    const dry = await call(postForm, secret, body);
    expect(dry.payload.applied).toBe(false);
    await submitTo(formId);

    // The plan is rebuilt on apply, and on a form that is now answered it is a
    // structural edit: refused for that reason, which names the way out.
    const refused = await call(postForm, secret, {
      ...body,
      planDigest: dry.payload.planDigest,
    });
    expect(refused.status).toBe(400);
    expect(refused.payload.error).toContain('write_feedback_form_copy');
    expect((await readForm(formId)).questions).toHaveLength(1);
  });

  it('lets an answered form be archived despite a defect its frozen structure carries', async () => {
    const created = await write(baseForm('défaut figé'));
    const formId = created.payload.formId!;
    // A choice question emptied in the builder before the first response, which
    // nothing there forbids, and which the lock now forbids fixing.
    await prisma.feedback_Question.create({
      data: {
        formId,
        key: 'vide',
        position: 2,
        prompt: 'Rien à choisir ?',
        type: 'single',
        required: false,
      },
    });
    await submitTo(formId);

    const read = await readForm(formId);
    expect(read.locked).toBe(true);
    const archived = await write({
      ...asWrite(read as FormRead & Record<string, unknown>),
      status: 'archived',
    });
    expect(archived.status, String(archived.payload.error)).toBe(200);
    expect((await readForm(formId)).status).toBe('archived');
  });

  it('refuses an apply once somebody else has edited the form since the plan', async () => {
    const created = await write(baseForm('édité entre-temps'));
    const formId = created.payload.formId!;
    const read = await readForm(formId);
    const body = {
      ...asWrite(read as FormRead & Record<string, unknown>),
      intro: 'Coucou',
    };

    const dry = await call(postForm, secret, body);
    await prisma.feedback_Form.update({
      where: { id: formId },
      data: { outro: 'Édité dans le builder' },
    });

    const stale = await call(postForm, secret, {
      ...body,
      planDigest: dry.payload.planDigest,
    });
    expect(stale.status).toBe(409);
    const after = await prisma.feedback_Form.findUniqueOrThrow({
      where: { id: formId },
      select: { intro: true, outro: true },
    });
    expect(after).toEqual({
      intro: 'Salut {prenom} !',
      outro: 'Édité dans le builder',
    });
  });

  it('refuses a form nobody could answer, with every reason at once, and creates nothing', async () => {
    const body = {
      ...baseForm('cassé'),
      status: 'published',
      allowsPublicAccess: true,
      questions: [{ key: 'avis', prompt: 'Ton avis ?', type: 'single' }],
    };
    const refused = await call(postForm, secret, body);
    expect(refused.status).toBe(400);
    expect(refused.payload.error).toContain('sans aucune option');
    expect(refused.payload.error).toContain("doit demander l'e-mail");
    expect(
      await prisma.feedback_Form.count({ where: { title: body.title } }),
    ).toBe(0);
  });

  it('refuses a misspelt option id rather than dropping it', async () => {
    const created = await write(baseForm('typo'));
    const read = await readForm(created.payload.formId!);
    const [top, ...rest] = read.questions[0].options;
    const { optionId, ...option } = top;

    const refused = await call(postForm, secret, {
      ...asWrite(read as FormRead & Record<string, unknown>),
      questions: [
        {
          ...read.questions[0],
          options: [{ ...option, optionID: optionId }, ...rest],
        },
      ],
    });
    expect(refused.status).toBe(400);
  });

  it('copies a persona icon once, keeps it when unmentioned, and drops it on null', async () => {
    const iconUrl = `${host}/canard.png`;
    const { writeFeedbackForm } =
      await import('$lib/server/adminApi/writes/feedbackForms');
    // Called under the wire, since the schema only accepts https and the
    // picture host of this test is plain http on loopback.
    const apply = async (body: Record<string, unknown>) => {
      const params = body as unknown as Parameters<typeof writeFeedbackForm>[0];
      const dry = await writeFeedbackForm(params, adminUserId);
      if (dry.applied) throw new Error('a dry run applied');
      return writeFeedbackForm(
        { ...params, planDigest: dry.planDigest },
        adminUserId,
      );
    };
    const iconOf = (formId: string) =>
      prisma.feedback_Form.findUniqueOrThrow({
        where: { id: formId },
        select: { personaIconKey: true, personaIconSourceUrl: true },
      });

    const body = {
      ...baseForm('icône'),
      questions: [
        {
          key: 'avis',
          prompt: 'Ton avis ?',
          type: 'single' as const,
          required: true,
          options: [{ label: 'Oui', kind: 'choice' as const }],
        },
      ],
      sections: [],
      status: 'draft' as const,
    };
    const created = await apply({ ...body, personaIconUrl: iconUrl });
    if (!created.applied) throw new Error('not applied');
    const formId = (created.after as FormRead).formId;
    const first = await iconOf(formId);
    expect(first.personaIconSourceUrl).toBe(iconUrl);
    expect(objects.has(first.personaIconKey!)).toBe(true);
    expect(requests).toBe(1);

    // Restating the address downloads nothing and keeps the stored copy.
    await apply({ ...body, formId, personaIconUrl: iconUrl });
    expect(await iconOf(formId)).toEqual(first);
    expect(requests).toBe(1);

    // Not mentioning it leaves it alone.
    await apply({ ...body, formId, title: title('icône bis') });
    expect(await iconOf(formId)).toEqual(first);

    // Null puts the mascot back and deletes the stored copy.
    await apply({ ...body, formId, personaIconUrl: null });
    expect(await iconOf(formId)).toEqual({
      personaIconKey: null,
      personaIconSourceUrl: null,
    });
    expect(objects.has(first.personaIconKey!)).toBe(false);

    // An address that serves nothing refuses a creation whole.
    const missing = `${host}/absent.png`;
    await expect(
      apply({
        ...body,
        title: title('icône absente'),
        personaIconUrl: missing,
      }),
    ).rejects.toThrow('Le formulaire n');
    expect(
      await prisma.feedback_Form.count({
        where: { title: title('icône absente') },
      }),
    ).toBe(0);
  });

  it('copies a form whole into a draft, without its responses', async () => {
    const created = await write({
      ...baseForm('original'),
      status: 'published',
    });
    const formId = created.payload.formId!;
    await submitTo(formId);

    const copied = await call(postCopy, secret, { formId });
    expect(copied.status, String(copied.payload.error)).toBe(200);
    const copyId = copied.payload.formId!;
    expect(copyId).not.toBe(formId);

    const original = await readForm(formId);
    const copy = await readForm(copyId);
    expect(copy.status).toBe('draft');
    expect(copy.locked).toBe(false);
    expect(copy.title).toBe(`${original.title} (copie)`);
    const shape = (f: FormRead) => [
      f.questions.map((q) => [q.key, q.options.map((o) => o.label)]),
      f.sections.map((s) => [s.title, s.questions.map((q) => q.key)]),
    ];
    expect(shape(copy)).toEqual(shape(original));
  });
});
