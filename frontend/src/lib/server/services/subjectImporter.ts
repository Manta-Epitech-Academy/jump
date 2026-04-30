/**
 * Imports a Jump subject from a GitHub repository.
 *
 * The repo is expected to follow Kevin's metadata.yaml schema (>= 1.5):
 *
 *   - One `metadata.yaml` at the root with project, runtime, documents, toc.
 *   - The toc walks `sections (H1) → parts (H2) → subparts (H3)` and may attach
 *     `observables: [{skill_path, id?}]` to any node.
 *   - Each declared `documents[].path` is fetched and rendered to HTML.
 *
 * Each call resolves the requested ref to a concrete commit SHA, pins the
 * import to the current `RefCompSnapshot`, and persists everything inside a
 * transaction. Re-importing the same `(repoUrl, commitSha)` is a no-op.
 */

import YAML from 'yaml';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'isomorphic-dompurify';
import GithubSlugger from 'github-slugger';

import { prisma } from '$lib/server/db';
import {
  parseRepoUrl,
  getCommitSha,
  getFileText,
  type RepoCoords,
} from './githubClient';
import { parseQuizBlocks } from './quizParser';
import { loadSnapshotResolver, type SnapshotResolver } from './refCompSync';
import { recordSync } from '$lib/server/infra/syncStatus';

// ─── Metadata YAML shapes (subset we read) ─────────────────────────────────

type ObservableRef = { skill_path: string; id?: number };

type TocSubpart = {
  title: string;
  observables?: ObservableRef[];
};

type TocPart = {
  title: string;
  subparts?: TocSubpart[];
  observables?: ObservableRef[];
};

type TocSection = {
  title: string;
  parts?: TocPart[];
  observables?: ObservableRef[];
};

type TocDocument = {
  document: string;
  sections: TocSection[];
};

type SubjectMetadata = {
  schema_version: string;
  project: { name: string; slug: string; summary: string; entrypoint: string };
  runtime: { engine: string; language: string };
  documents: { path: string }[];
  toc: TocDocument[];
};

// ─── Render setup ──────────────────────────────────────────────────────────

type RenderedHeading = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  anchor: string;
  title: string;
};

function buildSubjectMarked(
  slugger: GithubSlugger,
  headings: RenderedHeading[],
): Marked {
  const renderer = {
    heading({ tokens, depth }: { tokens: { raw: string }[]; depth: number }) {
      const text = tokens.map((t) => t.raw).join('');
      const id = slugger.slug(text);
      headings.push({
        level: depth as RenderedHeading['level'],
        anchor: id,
        title: text,
      });
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : '';
      const label = language || 'code';
      return `<div class="code-block-wrapper"><div class="code-block-lang">${label}</div><pre><code class="hljs${language ? ` language-${language}` : ''}">${text}</code></pre></div>`;
    },
  };
  return new Marked(
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    }),
    { gfm: true, breaks: true, renderer },
  );
}

function rewriteRelativeImageUrls(
  html: string,
  subjectId: string,
  sha: string,
  documentPath: string,
): string {
  return html.replace(/<img\b([^>]*?)\bsrc="([^"]+)"/g, (match, attrs, src) => {
    if (/^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:')) {
      return match;
    }
    const docDir = documentPath.includes('/')
      ? documentPath.substring(0, documentPath.lastIndexOf('/'))
      : '';
    const resolved = src.startsWith('/')
      ? src.replace(/^\/+/, '')
      : docDir
        ? `${docDir}/${src}`
        : src;
    // Route assets through Jump so private subject repos work and so we can
    // serve the same URL forever (sha-pinned, immutable in the proxy).
    const proxied = `/api/subjects/${subjectId}/assets/${sha}/${encodeURI(resolved)}`;
    return `<img${attrs}src="${proxied}"`;
  });
}

// ─── Toc walking ───────────────────────────────────────────────────────────

type FlatTocSection = {
  level: 1 | 2 | 3;
  title: string;
  observables: ObservableRef[];
};

function flattenToc(sections: TocSection[]): FlatTocSection[] {
  const out: FlatTocSection[] = [];
  for (const s of sections) {
    out.push({ level: 1, title: s.title, observables: s.observables ?? [] });
    for (const p of s.parts ?? []) {
      out.push({ level: 2, title: p.title, observables: p.observables ?? [] });
      for (const sp of p.subparts ?? []) {
        out.push({
          level: 3,
          title: sp.title,
          observables: sp.observables ?? [],
        });
      }
    }
  }
  return out;
}

// ─── Importer entry point ──────────────────────────────────────────────────

export type ImportSubjectParams = {
  repoUrl: string;
  ref?: string;
  importedByStaffProfileId: string;
};

export type ImportSubjectError =
  | { kind: 'no_ref_comp'; message: string }
  | { kind: 'fetch_failed'; message: string }
  | { kind: 'invalid_metadata'; message: string }
  | { kind: 'duplicate_slug'; message: string }
  | { kind: 'unresolved_observable'; message: string };

export type ImportWarning =
  | {
      kind: 'unresolved_observable';
      skillPath: string;
      observableId?: number;
      sectionTitle: string;
      reason: string;
    }
  | {
      kind: 'unmatched_toc_section';
      sectionTitle: string;
      documentPath: string;
      reason: string;
    };

export type ImportSubjectResult = {
  status: 'created' | 'reused';
  subjectVersionId: string;
  subjectId: string;
  commitSha: string;
  counts: {
    documents: number;
    sections: number;
    quizzes: number;
    quizErrors: number;
    observableLinks: number;
  };
  warnings: ImportWarning[];
};

export async function importSubject(
  params: ImportSubjectParams,
): Promise<ImportSubjectResult> {
  const coords = parseRepoUrl(params.repoUrl);
  const ref = params.ref ?? 'main';
  const sha = await getCommitSha(coords, ref);

  const currentSnapshot = await prisma.refCompSnapshot.findFirst({
    where: { isCurrent: true },
    select: { id: true, commitSha: true },
  });
  if (!currentSnapshot) {
    throw {
      kind: 'no_ref_comp',
      message: 'No current RefCompSnapshot. Run /api/jobs/sync-ref-comp first.',
    } satisfies ImportSubjectError;
  }

  const meta = await fetchAndValidateMetadata(coords, sha);
  const repoUrl = `https://github.com/${coords.owner}/${coords.repo}`;
  const projectSlug = meta.project.slug;

  // Reuse existing import for this commit, if any.
  const existingSubject = await prisma.subject.findUnique({
    where: { repoUrl },
    include: {
      versions: { where: { repoCommitSha: sha }, take: 1 },
    },
  });
  if (existingSubject?.versions[0]) {
    return {
      status: 'reused',
      subjectVersionId: existingSubject.versions[0].id,
      subjectId: existingSubject.id,
      commitSha: sha,
      counts: {
        documents: 0,
        sections: 0,
        quizzes: 0,
        quizErrors: 0,
        observableLinks: 0,
      },
      warnings: [],
    };
  }

  // Slug uniqueness is enforced at the DB level. Surface collisions before
  // rendering so the failure mode is actionable instead of a bare Prisma
  // unique-constraint trace.
  const slugCollision = await prisma.subject.findUnique({
    where: { slug: projectSlug },
    select: { repoUrl: true },
  });
  if (slugCollision && slugCollision.repoUrl !== repoUrl) {
    throw {
      kind: 'duplicate_slug',
      message: `Le slug "${projectSlug}" est déjà utilisé par ${slugCollision.repoUrl}. Modifie metadata.yaml ou supprime l'autre sujet.`,
    } satisfies ImportSubjectError;
  }

  const resolver = await loadSnapshotResolver(currentSnapshot.id);

  // Upsert the Subject row up front so we know its id during HTML rendering
  // (asset URLs are subjectId-scoped). Subject is a thin (repoUrl, slug)
  // record with no children — leaving it created if downstream fails is
  // safe, and a retry will simply find it via the upsert.
  const subject = await prisma.subject.upsert({
    where: { repoUrl },
    create: { repoUrl, slug: projectSlug },
    update: { slug: projectSlug },
  });

  // Fetch + render every declared document in parallel. Each doc owns its
  // own slugger so anchors stay deterministic per-document, and the
  // renderer captures (level, anchor, title) tuples in order so the toc
  // walk later can match by title without re-running the slugger.
  const rendered = await Promise.all(
    meta.documents.map(async (docDecl, sortOrder) => {
      const text = await getFileText(coords, docDecl.path, sha);
      const { blocks, strippedMd, errors } = parseQuizBlocks(text);

      const slugger = new GithubSlugger();
      const headings: RenderedHeading[] = [];
      const subjectMarked = buildSubjectMarked(slugger, headings);

      const html = (await subjectMarked.parse(strippedMd)) as string;
      const sanitized = DOMPurify.sanitize(html, {
        ADD_ATTR: ['data-jump-quiz', 'id'],
      });
      const finalHtml = rewriteRelativeImageUrls(
        sanitized,
        subject.id,
        sha,
        docDecl.path,
      );
      return {
        path: docDecl.path,
        sortOrder,
        rawMd: strippedMd,
        renderedHtml: finalHtml,
        headings,
        quizzes: blocks,
        quizErrors: errors,
      };
    }),
  );

  // Walk the toc against the rendered heading list to pick up the actual
  // anchor IDs. This is the only correct way to keep TOC anchors in sync
  // with the rendered HTML — the renderer's slugger is the source of truth.
  type TocBinding = {
    documentPath: string;
    level: 1 | 2 | 3;
    anchor: string;
    title: string;
    sortOrder: number;
    observables: ObservableRef[];
  };
  const tocBindings: TocBinding[] = [];
  const warnings: ImportWarning[] = [];
  let globalOrder = 0;
  for (const tocDoc of meta.toc) {
    const docHeadings =
      rendered.find((r) => r.path === tocDoc.document)?.headings ?? null;
    if (!docHeadings) {
      warnings.push({
        kind: 'unmatched_toc_section',
        sectionTitle: '<all>',
        documentPath: tocDoc.document,
        reason: `toc.document "${tocDoc.document}" not present in metadata.documents.`,
      });
      continue;
    }

    // Walk both lists in order; consume rendered headings up to and
    // including the one that matches the current toc entry.
    let cursor = 0;
    for (const tocSection of flattenToc(tocDoc.sections)) {
      const matchIdx = docHeadings.findIndex(
        (h, i) =>
          i >= cursor &&
          h.level === tocSection.level &&
          h.title === tocSection.title,
      );
      if (matchIdx < 0) {
        warnings.push({
          kind: 'unmatched_toc_section',
          sectionTitle: tocSection.title,
          documentPath: tocDoc.document,
          reason: `H${tocSection.level} "${tocSection.title}" declared in toc but not found in rendered HTML.`,
        });
        continue;
      }
      tocBindings.push({
        documentPath: tocDoc.document,
        level: tocSection.level,
        anchor: docHeadings[matchIdx].anchor,
        title: tocSection.title,
        sortOrder: globalOrder++,
        observables: tocSection.observables,
      });
      cursor = matchIdx + 1;
    }
  }

  // Resolve every observable ref against the snapshot in memory. Unresolved
  // refs become warnings so a single bad pointer doesn't block the whole
  // import — the editor still gets a working subject and can see exactly
  // which references need fixing in ref_comp or the metadata.
  type ResolvedObsRef = {
    sectionAnchor: string;
    documentPath: string;
    skillLevelId: string;
    observableId: string;
  };
  const resolvedObs: ResolvedObsRef[] = collectResolvedObservables(
    tocBindings,
    projectSlug,
    resolver,
    warnings,
  );

  // Persist the entire import inside one transaction. Subject is already
  // upserted above; the SubjectVersion is the new content snapshot.
  const persisted = await prisma.$transaction(async (tx) => {
    const subjectVersion = await tx.subjectVersion.create({
      data: {
        subjectId: subject.id,
        repoCommitSha: sha,
        refCompSnapshotId: currentSnapshot.id,
        metadataJson: meta as unknown as object,
        importedById: params.importedByStaffProfileId,
      },
    });

    const documents = await tx.document.createManyAndReturn({
      data: rendered.map((doc) => ({
        subjectVersionId: subjectVersion.id,
        path: doc.path,
        rawMd: doc.rawMd,
        renderedHtml: doc.renderedHtml,
        sortOrder: doc.sortOrder,
      })),
      select: { id: true, path: true },
    });
    const documentIdByPath = new Map(documents.map((d) => [d.path, d.id]));

    const sections = await tx.section.createManyAndReturn({
      data: tocBindings.flatMap((entry) => {
        const documentId = documentIdByPath.get(entry.documentPath);
        if (!documentId) return [];
        return [
          {
            subjectVersionId: subjectVersion.id,
            documentId,
            level: entry.level,
            anchor: entry.anchor,
            title: entry.title,
            sortOrder: entry.sortOrder,
          },
        ];
      }),
      select: { id: true, documentId: true, anchor: true },
    });
    const sectionIdByKey = new Map(
      sections.map((s) => [`${s.documentId}#${s.anchor}`, s.id]),
    );

    const observableLinkData = resolvedObs.flatMap((ref) => {
      const documentId = documentIdByPath.get(ref.documentPath);
      if (!documentId) return [];
      const sectionId = sectionIdByKey.get(
        `${documentId}#${ref.sectionAnchor}`,
      );
      if (!sectionId) return [];
      return [
        {
          subjectVersionId: subjectVersion.id,
          sectionId,
          observableId: ref.observableId,
          skillLevelId: ref.skillLevelId,
        },
      ];
    });
    const observableLinks = observableLinkData.length
      ? await tx.subjectObservable.createMany({
          data: observableLinkData,
          skipDuplicates: true,
        })
      : { count: 0 };

    const quizzesData = rendered.flatMap((doc) => {
      const documentId = documentIdByPath.get(doc.path);
      if (!documentId) return [];
      return doc.quizzes.map((q) => ({
        subjectVersionId: subjectVersion.id,
        documentId,
        fqn: q.fqn,
        type: q.type,
        expectedCount: q.expectedCount,
        level: q.level,
        externalIndex: q.externalIndex,
        title: q.title,
        question: q.question,
        options: q.options as unknown as object,
      }));
    });
    const quizzes = quizzesData.length
      ? await tx.subjectQuiz.createMany({ data: quizzesData })
      : { count: 0 };

    return {
      subjectVersionId: subjectVersion.id,
      documents: documents.length,
      sections: sections.length,
      quizzes: quizzes.count,
      quizErrors: rendered.reduce((n, d) => n + d.quizErrors.length, 0),
      observableLinks: observableLinks.count,
    };
  });

  await recordSync({
    type: 'subject_import',
    commitSha: sha,
    subjectSlug: projectSlug,
    created: 1,
  });

  return {
    status: 'created',
    subjectVersionId: persisted.subjectVersionId,
    subjectId: subject.id,
    commitSha: sha,
    counts: {
      documents: persisted.documents,
      sections: persisted.sections,
      quizzes: persisted.quizzes,
      quizErrors: persisted.quizErrors,
      observableLinks: persisted.observableLinks,
    },
    warnings,
  };
}

async function fetchAndValidateMetadata(
  coords: RepoCoords,
  sha: string,
): Promise<SubjectMetadata> {
  const text = await getFileText(coords, 'metadata.yaml', sha);
  let meta: SubjectMetadata;
  try {
    meta = YAML.parse(text) as SubjectMetadata;
  } catch (err) {
    throw {
      kind: 'invalid_metadata',
      message: `metadata.yaml YAML parse error: ${err instanceof Error ? err.message : err}`,
    } satisfies ImportSubjectError;
  }
  if (!meta?.project?.slug || !meta?.toc || !meta?.documents) {
    throw {
      kind: 'invalid_metadata',
      message:
        'metadata.yaml missing required fields (project.slug, documents, toc).',
    } satisfies ImportSubjectError;
  }
  if (!/^\d+\.\d+/.test(meta.schema_version ?? '')) {
    throw {
      kind: 'invalid_metadata',
      message: `Unsupported schema_version "${meta.schema_version}" (need >= 1.5).`,
    } satisfies ImportSubjectError;
  }
  const major = Number(meta.schema_version.split('.')[0] ?? '0');
  const minor = Number(meta.schema_version.split('.')[1] ?? '0');
  if (major < 1 || (major === 1 && minor < 5)) {
    throw {
      kind: 'invalid_metadata',
      message: `schema_version ${meta.schema_version} too old; need >= 1.5.`,
    } satisfies ImportSubjectError;
  }
  return meta;
}

function collectResolvedObservables(
  tocBindings: ReadonlyArray<{
    documentPath: string;
    anchor: string;
    title: string;
    observables: ObservableRef[];
  }>,
  projectSlug: string,
  resolver: SnapshotResolver,
  warnings: ImportWarning[],
): {
  sectionAnchor: string;
  documentPath: string;
  skillLevelId: string;
  observableId: string;
}[] {
  const out: {
    sectionAnchor: string;
    documentPath: string;
    skillLevelId: string;
    observableId: string;
  }[] = [];
  for (const entry of tocBindings) {
    for (const ref of entry.observables) {
      const skill = resolver.resolveSkillPath(ref.skill_path);
      if (!skill) {
        warnings.push({
          kind: 'unresolved_observable',
          skillPath: ref.skill_path,
          observableId: ref.id,
          sectionTitle: entry.title,
          reason: `Skill path "${ref.skill_path}" not found in ref_comp snapshot (commit ${resolver.commitSha.slice(0, 7)}).`,
        });
        continue;
      }
      if (typeof ref.id !== 'number') {
        warnings.push({
          kind: 'unresolved_observable',
          skillPath: ref.skill_path,
          sectionTitle: entry.title,
          reason: `Observable ref under "${entry.title}" missing numeric id.`,
        });
        continue;
      }
      const obs = resolver.resolveObservable(projectSlug, ref.id);
      if (!obs) {
        warnings.push({
          kind: 'unresolved_observable',
          skillPath: ref.skill_path,
          observableId: ref.id,
          sectionTitle: entry.title,
          reason: `Observable ${projectSlug}.${ref.id} not declared in ref_comp.`,
        });
        continue;
      }
      out.push({
        sectionAnchor: entry.anchor,
        documentPath: entry.documentPath,
        skillLevelId: skill.skillLevelId,
        observableId: obs.observableId,
      });
    }
  }
  return out;
}

export async function resyncSubject(
  subjectId: string,
  importedByStaffProfileId: string,
  ref?: string,
): Promise<ImportSubjectResult> {
  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: subjectId },
  });
  return importSubject({
    repoUrl: subject.repoUrl,
    ref,
    importedByStaffProfileId,
  });
}
